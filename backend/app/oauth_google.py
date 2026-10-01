import base64
import hashlib
import secrets
import time
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.config import settings

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
STATE_TTL_SECONDS = 600


@dataclass
class GoogleProfile:
    sub: str
    email: str
    email_verified: bool
    name: str | None
    picture: str | None


@dataclass
class PendingLogin:
    verifier: str
    next_path: str
    expires_at: float


class OAuthError(Exception):
    pass


_pending: dict[str, PendingLogin] = {}


def enabled() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)


def redirect_uri() -> str:
    return f"{settings.public_app_url.rstrip('/')}/api/auth/google/callback"


def _prune(now: float) -> None:
    for state in [s for s, p in _pending.items() if p.expires_at < now]:
        del _pending[state]


def begin(next_path: str) -> str:
    now = time.monotonic()
    _prune(now)
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    _pending[state] = PendingLogin(verifier, next_path, now + STATE_TTL_SECONDS)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    query = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    return f"{AUTHORIZE_URL}?{urlencode(query)}"


def consume(state: str) -> PendingLogin:
    pending = _pending.pop(state, None)
    if pending is None or pending.expires_at < time.monotonic():
        raise OAuthError("invalid_state")
    return pending


async def fetch_profile(code: str, verifier: str) -> GoogleProfile:
    async with httpx.AsyncClient(timeout=10) as client:
        token = await client.post(
            TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri(),
                "grant_type": "authorization_code",
                "code_verifier": verifier,
            },
        )
        if token.status_code != 200:
            raise OAuthError("token_exchange_failed")
        access_token = token.json().get("access_token")
        info = await client.get(USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"})
        if info.status_code != 200:
            raise OAuthError("userinfo_failed")
        data = info.json()
    if not data.get("sub") or not data.get("email"):
        raise OAuthError("incomplete_profile")
    return GoogleProfile(
        sub=str(data["sub"]),
        email=str(data["email"]).strip().lower(),
        email_verified=bool(data.get("email_verified")),
        name=data.get("name"),
        picture=data.get("picture"),
    )
