from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import select

from app import oauth_google
from app.config import settings
from app.models import User, WorkspaceMember
from tests.conftest import MakeUser, new_client


@pytest.fixture
def google(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "google_client_id", "client-id")
    monkeypatch.setattr(settings, "google_client_secret", "client-secret")
    profile = oauth_google.GoogleProfile(
        sub="google-123",
        email="ada@example.com",
        email_verified=True,
        name="Ada L",
        picture="https://img/ada.png",
    )

    async def fake_fetch(code: str, verifier: str) -> oauth_google.GoogleProfile:
        assert code == "the-code" and verifier
        return profile

    monkeypatch.setattr(oauth_google, "fetch_profile", fake_fetch)
    return profile


async def start(client, next_path: str = "/w/somewhere") -> str:
    r = await client.get("/api/auth/google/start", params={"next": next_path})
    assert r.status_code == 303
    query = parse_qs(urlparse(r.headers["location"]).query)
    assert query["client_id"] == ["client-id"]
    assert query["code_challenge_method"] == ["S256"]
    assert query["redirect_uri"] == [f"{settings.public_app_url}/api/auth/google/callback"]
    return query["state"][0]


async def test_providers_reflect_configuration(client, monkeypatch):
    assert (await client.get("/api/auth/providers")).json() == {"google": False}
    r = await client.get("/api/auth/google/start")
    assert r.status_code == 303 and r.headers["location"] == "/login?error=google_disabled"
    monkeypatch.setattr(settings, "google_client_id", "x")
    monkeypatch.setattr(settings, "google_client_secret", "y")
    assert (await client.get("/api/auth/providers")).json() == {"google": True}


async def test_google_sign_in_creates_an_account_with_avatar(client, google, db):
    state = await start(client)
    r = await client.get("/api/auth/google/callback", params={"code": "the-code", "state": state})
    assert r.status_code == 303 and r.headers["location"] == "/w/somewhere"
    me = (await client.get("/api/auth/me")).json()
    assert me["email"] == "ada@example.com" and me["name"] == "Ada L"
    assert me["avatarUrl"] == "https://img/ada.png"
    user = await db.scalar(select(User).where(User.email == "ada@example.com"))
    assert user.password_hash is None and user.google_sub == "google-123"
    assert await db.scalar(select(WorkspaceMember.role).where(WorkspaceMember.user_id == user.id)) == "owner"

    again = await client.get("/api/auth/google/callback", params={"code": "the-code", "state": state})
    assert again.headers["location"] == "/login?error=google_failed"


async def test_google_sign_in_links_an_existing_email_account(make_user: MakeUser, google, db):
    existing = await make_user("Ada Existing")
    google.email = existing.email
    async with new_client() as c:
        state = await start(c, "/app")
        r = await c.get("/api/auth/google/callback", params={"code": "the-code", "state": state})
        assert r.status_code == 303
        assert (await c.get("/api/auth/me")).json()["id"] == existing.id
    user = await db.scalar(select(User).where(User.email == existing.email))
    assert user.google_sub == "google-123"
    async with new_client() as c:
        ok = await c.post("/api/auth/login", json={"email": existing.email, "password": existing.password})
        assert ok.status_code == 200


async def test_google_failures_redirect_to_login(client, google):
    r = await client.get("/api/auth/google/callback", params={"code": "the-code", "state": "forged"})
    assert r.headers["location"] == "/login?error=google_failed"
    r = await client.get("/api/auth/google/callback", params={"error": "access_denied", "state": "x"})
    assert r.headers["location"] == "/login?error=google_cancelled"
    google.email_verified = False
    state = await start(client)
    r = await client.get("/api/auth/google/callback", params={"code": "the-code", "state": state})
    assert r.headers["location"] == "/login?error=google_unverified"


async def test_open_redirects_are_not_possible(client, google):
    state = await start(client, "//evil.example/x")
    r = await client.get("/api/auth/google/callback", params={"code": "the-code", "state": state})
    assert r.headers["location"] == "/app"


async def test_password_login_is_refused_for_google_only_accounts(client, google):
    state = await start(client)
    await client.get("/api/auth/google/callback", params={"code": "the-code", "state": state})
    async with new_client() as c:
        r = await c.post("/api/auth/login", json={"email": "ada@example.com", "password": "anything-at-all"})
        assert r.status_code == 401


async def test_google_accounts_can_set_a_first_password(client, google):
    state = await start(client)
    await client.get("/api/auth/google/callback", params={"code": "the-code", "state": state})
    assert (await client.get("/api/auth/me")).json()["hasPassword"] is False
    r = await client.patch("/api/auth/me", json={"newPassword": "first password!"})
    assert r.status_code == 200 and r.json()["hasPassword"] is True
    async with new_client() as c:
        ok = await c.post("/api/auth/login", json={"email": "ada@example.com", "password": "first password!"})
        assert ok.status_code == 200
