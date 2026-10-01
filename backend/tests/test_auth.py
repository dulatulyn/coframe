from sqlalchemy import func, select

from app.models import Role, UserSession, WorkspaceMember
from tests.conftest import MakeUser, new_client


async def test_health(client):
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


async def test_signup_sets_cookie_and_creates_owned_workspace(client, db):
    r = await client.post(
        "/api/auth/signup",
        json={"email": "  Ada@Example.com ", "password": "long enough", "name": "Ada"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["email"] == "ada@example.com"
    assert body["name"] == "Ada"
    assert body["color"].startswith("#")
    assert "createdAt" in body and "passwordHash" not in body
    assert "sid" in r.cookies

    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["id"] == body["id"]

    roles = (await db.scalars(select(WorkspaceMember.role))).all()
    assert roles == [Role.owner]


async def test_signup_duplicate_email_conflicts(client):
    payload = {"email": "bob@example.com", "password": "long enough", "name": "Bob"}
    assert (await client.post("/api/auth/signup", json=payload)).status_code == 201
    async with new_client() as other:
        r = await other.post("/api/auth/signup", json={**payload, "email": "BOB@example.com"})
    assert r.status_code == 409
    assert r.json()["detail"] == "email_taken"


async def test_signup_validation(client):
    r = await client.post(
        "/api/auth/signup", json={"email": "x@example.com", "password": "short", "name": "X"}
    )
    assert r.status_code == 422
    r = await client.post(
        "/api/auth/signup", json={"email": "not-an-email", "password": "long enough", "name": "X"}
    )
    assert r.status_code == 422
    r = await client.post(
        "/api/auth/signup", json={"email": "y@example.com", "password": "long enough", "name": "  "}
    )
    assert r.status_code == 422


async def test_login_and_logout(make_user: MakeUser, db):
    user = await make_user()
    async with new_client() as c:
        bad = await c.post("/api/auth/login", json={"email": user.email, "password": "wrong password"})
        assert bad.status_code == 401
        assert bad.json()["detail"] == "invalid_credentials"
        unknown = await c.post(
            "/api/auth/login", json={"email": "nobody@example.com", "password": "whatever1"}
        )
        assert unknown.status_code == 401

        ok = await c.post("/api/auth/login", json={"email": user.email.upper(), "password": user.password})
        assert ok.status_code == 200
        assert (await c.get("/api/auth/me")).status_code == 200

        sessions_before = await db.scalar(select(func.count()).select_from(UserSession))
        out = await c.post("/api/auth/logout")
        assert out.status_code == 204
        assert (await c.get("/api/auth/me")).status_code == 401
        sessions_after = await db.scalar(select(func.count()).select_from(UserSession))
        assert sessions_after == sessions_before - 1


async def test_me_requires_auth(client):
    r = await client.get("/api/auth/me")
    assert r.status_code == 401
    assert r.json()["detail"] == "not_authenticated"


async def test_login_rate_limited(make_user: MakeUser):
    user = await make_user()
    async with new_client() as c:
        codes = [
            (await c.post("/api/auth/login", json={"email": user.email, "password": "nope-nope"})).status_code
            for _ in range(11)
        ]
    assert codes[:10] == [401] * 10
    assert codes[10] == 429


async def test_update_me(make_user: MakeUser):
    user = await make_user("Old Name")
    c = user.client
    r = await c.patch("/api/auth/me", json={"name": "New Name", "color": "#12a594"})
    assert r.status_code == 200
    assert r.json()["name"] == "New Name"
    assert r.json()["color"] == "#12A594"

    wrong = await c.patch("/api/auth/me", json={"currentPassword": "nope", "newPassword": "brand new pass"})
    assert wrong.status_code == 400
    assert wrong.json()["detail"] == "wrong_password"

    ok = await c.patch(
        "/api/auth/me", json={"currentPassword": user.password, "newPassword": "brand new pass"}
    )
    assert ok.status_code == 200
    async with new_client() as other:
        relog = await other.post("/api/auth/login", json={"email": user.email, "password": "brand new pass"})
        assert relog.status_code == 200
