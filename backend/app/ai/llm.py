from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Literal, Protocol, TypeVar

import httpx
from pydantic import BaseModel

from app.config import settings

log = logging.getLogger(__name__)

Tier = Literal["smart", "fast"]
T = TypeVar("T", bound=BaseModel)

FALLBACK_MODELS: dict[Tier, str] = {"smart": "gemini-2.5-pro", "fast": "gemini-2.5-flash"}
MODEL_PATTERNS: dict[Tier, re.Pattern[str]] = {
    "smart": re.compile(r"^gemini-(\d+(?:\.\d+)?)-pro$"),
    "fast": re.compile(r"^gemini-(\d+(?:\.\d+)?)-flash$"),
}
MAX_OUTPUT_TOKENS: dict[Tier, int] = {"smart": 12000, "fast": 3000}


@dataclass
class Usage:
    model: str
    input_tokens: int
    output_tokens: int

    @property
    def cost_usd(self) -> float:
        smart = not self.model.endswith("flash")
        price_in = settings.ai_price_smart_input if smart else settings.ai_price_fast_input
        price_out = settings.ai_price_smart_output if smart else settings.ai_price_fast_output
        return (self.input_tokens * price_in + self.output_tokens * price_out) / 1_000_000


class AiUnavailable(RuntimeError):
    pass


class AiFailed(RuntimeError):
    def __init__(self, message: str, usage: Usage | None = None) -> None:
        super().__init__(message)
        self.usage = usage


class Provider(Protocol):
    async def generate_json(
        self, tier: Tier, system: str, prompt: str, schema: type[T]
    ) -> tuple[T, Usage]: ...

    def stream_text(
        self, tier: Tier, system: str, contents: list[tuple[str, str]]
    ) -> AsyncIterator[str | Usage]: ...


def _version(name: str, tier: Tier) -> tuple[int, ...] | None:
    match = MODEL_PATTERNS[tier].match(name)
    return tuple(int(part) for part in match.group(1).split(".")) if match else None


def pick_latest(names: list[str], tier: Tier) -> str | None:
    versions = [(v, n) for n in names if (v := _version(n, tier)) is not None]
    return max(versions)[1] if versions else None


class Gemini:
    def __init__(self, project: str, location: str) -> None:
        from google import genai

        self.project = project
        self.client = genai.Client(enterprise=True, project=project, location=location)
        self._models: dict[Tier, str] = {}
        self._lock = asyncio.Lock()

    async def _available(self) -> list[str]:
        import google.auth
        from google.auth.transport.requests import Request

        def token() -> str:
            credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
            credentials.refresh(Request())
            return credentials.token

        access = await asyncio.to_thread(token)
        async with httpx.AsyncClient(timeout=20) as http:
            response = await http.get(
                "https://aiplatform.googleapis.com/v1beta1/publishers/google/models",
                params={"pageSize": 300},
                headers={"Authorization": f"Bearer {access}", "X-Goog-User-Project": self.project},
            )
            response.raise_for_status()
        return [m.get("name", "").rsplit("/", 1)[-1] for m in response.json().get("publisherModels", [])]

    async def model(self, tier: Tier) -> str:
        configured = settings.ai_model_smart if tier == "smart" else settings.ai_model_fast
        if configured != "auto":
            return configured
        async with self._lock:
            if tier not in self._models:
                try:
                    names = await self._available()
                except Exception:
                    log.exception("could not list Gemini models; using a fallback")
                    names = []
                self._models[tier] = pick_latest(names, tier) or FALLBACK_MODELS[tier]
                log.info("using %s for %s requests", self._models[tier], tier)
            return self._models[tier]

    def _config(self, tier: Tier, system: str, **extra: object):
        from google.genai import types

        return types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=MAX_OUTPUT_TOKENS[tier],
            temperature=0.2 if tier == "smart" else 0.4,
            **extra,
        )

    @staticmethod
    def _usage(model: str, metadata: object | None) -> Usage:
        prompt = getattr(metadata, "prompt_token_count", 0) or 0
        output = (getattr(metadata, "candidates_token_count", 0) or 0) + (
            getattr(metadata, "thoughts_token_count", 0) or 0
        )
        return Usage(model, prompt, output)

    async def generate_json(self, tier: Tier, system: str, prompt: str, schema: type[T]) -> tuple[T, Usage]:
        model = await self.model(tier)
        response = await self.client.aio.models.generate_content(
            model=model,
            contents=prompt,
            config=self._config(tier, system, response_mime_type="application/json", response_schema=schema),
        )
        usage = self._usage(model, response.usage_metadata)
        parsed = response.parsed
        if isinstance(parsed, schema):
            return parsed, usage
        try:
            return schema.model_validate_json(response.text or ""), usage
        except Exception as exc:
            raise AiFailed("the model returned an unexpected answer", usage) from exc

    async def stream_text(
        self, tier: Tier, system: str, contents: list[tuple[str, str]]
    ) -> AsyncIterator[str | Usage]:
        from google.genai import types

        model = await self.model(tier)
        messages = [
            types.Content(role="model" if role == "assistant" else "user", parts=[types.Part(text=text)])
            for role, text in contents
        ]
        metadata = None
        async for chunk in await self.client.aio.models.generate_content_stream(
            model=model, contents=messages, config=self._config(tier, system)
        ):
            if chunk.usage_metadata is not None:
                metadata = chunk.usage_metadata
            if chunk.text:
                yield chunk.text
        yield self._usage(model, metadata)


_provider: Provider | None = None


def provider() -> Provider:
    global _provider
    if _provider is None:
        if not settings.gcp_project:
            raise AiUnavailable("ai_not_configured")
        _provider = Gemini(settings.gcp_project, settings.gcp_location)
    return _provider


def set_provider(value: Provider | None) -> None:
    global _provider
    _provider = value
