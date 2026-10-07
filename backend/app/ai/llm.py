from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from typing import Literal, Protocol, TypeVar

import httpx
from pydantic import BaseModel

from app.config import settings

log = logging.getLogger(__name__)

Tier = Literal["smart", "fast"]
T = TypeVar("T", bound=BaseModel)

FALLBACK_MODELS: dict[Tier, str] = {"smart": "gemini-3.1-pro-preview", "fast": "gemini-3.8-flash"}
MODEL_PATTERNS: dict[Tier, re.Pattern[str]] = {
    "smart": re.compile(r"^gemini-(\d+(?:\.\d+)?)-pro$"),
    "fast": re.compile(r"^gemini-(\d+(?:\.\d+)?)-flash$"),
}
MAX_OUTPUT_TOKENS: dict[Tier, int] = {"smart": 12000, "fast": 3000}
THINKING_LEVELS: dict[Tier, str | None] = {"smart": None, "fast": "LOW"}


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


JSON_ATTEMPTS = 2
MAX_JSON_CHARS = 40_000
BLANK_RUN = re.compile(r"(?:\\[nrt]|\s){48,}$")


def runaway(text: str) -> bool:
    if len(text) > MAX_JSON_CHARS:
        return True
    tail = text[-600:]
    if BLANK_RUN.search(tail):
        return True
    probe = text[-60:]
    return len(text) > 600 and len(probe.strip()) > 0 and tail.count(probe) >= 4


class AiFailed(RuntimeError):
    def __init__(self, message: str, usage: Usage | None = None) -> None:
        super().__init__(message)
        self.usage = usage


class Provider(Protocol):
    async def generate_json(
        self, tier: Tier, system: str, prompt: str, schema: type[T], thinking: str | None = None
    ) -> tuple[T, Usage]: ...


def _version(name: str, tier: Tier) -> tuple[int, ...] | None:
    match = MODEL_PATTERNS[tier].match(name)
    return tuple(int(part) for part in match.group(1).split(".")) if match else None


def pick_latest(names: list[str], tier: Tier) -> str | None:
    versions = [(v, n) for n in names if (v := _version(n, tier)) is not None]
    return max(versions)[1] if versions else None


class Gemini:
    def __init__(self, project: str | None, location: str, api_key: str | None = None) -> None:
        from google import genai
        from google.genai import types

        self.project = project
        self.api_key = api_key
        http_options = types.HttpOptions(
            timeout=180_000,
            retry_options=types.HttpRetryOptions(
                attempts=4,
                initial_delay=2.0,
                max_delay=30.0,
                http_status_codes=[408, 429, 500, 502, 503, 504],
            ),
        )
        if api_key:
            self.client = genai.Client(enterprise=True, api_key=api_key, http_options=http_options)
        else:
            self.client = genai.Client(
                enterprise=True, project=project, location=location, http_options=http_options
            )
        self._models: dict[Tier, str] = {}
        self._lock = asyncio.Lock()

    async def _available(self) -> list[str]:
        if self.api_key:
            return []

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
                except Exception as exc:
                    log.warning("could not list Gemini models, using a fallback: %s", exc)
                    names = []
                self._models[tier] = pick_latest(names, tier) or FALLBACK_MODELS[tier]
                log.info("using %s for %s requests", self._models[tier], tier)
            return self._models[tier]

    def _config(self, tier: Tier, system: str, thinking: str | None = None, **extra: object):
        from google.genai import types

        thinking = thinking or THINKING_LEVELS[tier]
        return types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=MAX_OUTPUT_TOKENS[tier],
            thinking_config=types.ThinkingConfig(thinking_level=thinking) if thinking else None,
            **extra,
        )

    @staticmethod
    def _usage(model: str, metadata: object | None) -> Usage:
        prompt = getattr(metadata, "prompt_token_count", 0) or 0
        output = (getattr(metadata, "candidates_token_count", 0) or 0) + (
            getattr(metadata, "thoughts_token_count", 0) or 0
        )
        return Usage(model, prompt, output)

    async def _stream_json(self, model: str, config: object, prompt: str) -> tuple[str, Usage, object, bool]:
        stream = await self.client.aio.models.generate_content_stream(
            model=model, contents=prompt, config=config
        )
        text = ""
        metadata = None
        finish = None
        stopped = False
        try:
            async for chunk in stream:
                if chunk.usage_metadata is not None:
                    metadata = chunk.usage_metadata
                if chunk.candidates and chunk.candidates[0].finish_reason:
                    finish = chunk.candidates[0].finish_reason
                if chunk.text:
                    text += chunk.text
                    if runaway(text):
                        stopped = True
                        break
        finally:
            closer = getattr(stream, "aclose", None)
            if closer is not None:
                await closer()
        usage = self._usage(model, metadata)
        if metadata is None:
            usage = Usage(model, len(prompt) // 3, len(text) // 3)
        return text, usage, finish, stopped

    async def generate_json(
        self, tier: Tier, system: str, prompt: str, schema: type[T], thinking: str | None = None
    ) -> tuple[T, Usage]:
        model = await self.model(tier)
        spent = Usage(model, 0, 0)
        failure: Exception | None = None
        for attempt in range(JSON_ATTEMPTS):
            config = self._config(
                tier,
                system,
                thinking,
                response_mime_type="application/json",
                response_json_schema=schema.model_json_schema(),
            )
            text, usage, finish, stopped = await self._stream_json(model, config, prompt)
            spent = Usage(
                model, spent.input_tokens + usage.input_tokens, spent.output_tokens + usage.output_tokens
            )
            if stopped:
                log.warning(
                    "stopped a runaway %s answer (attempt %d) after %d chars: %r",
                    model,
                    attempt + 1,
                    len(text),
                    text[-160:],
                )
                failure = AiFailed("runaway answer")
                continue
            try:
                return schema.model_validate_json(text), spent
            except Exception as exc:
                log.warning("unusable %s answer (attempt %d, finish %s): %s", model, attempt + 1, finish, exc)
                failure = exc
        raise AiFailed("the model returned an unexpected answer", spent) from failure


_provider: Provider | None = None


def ai_configured() -> bool:
    return bool(settings.gemini_api_key or settings.gcp_project)


def provider() -> Provider:
    global _provider
    if _provider is None:
        if not ai_configured():
            raise AiUnavailable("ai_not_configured")
        _provider = Gemini(settings.gcp_project, settings.gcp_location, settings.gemini_api_key)
    return _provider


def set_provider(value: Provider | None) -> None:
    global _provider
    _provider = value
