import os

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://localhost/coframe_test"
)

import itertools
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass

import httpx
import pytest
from sqlalchemy import text

from app.db import Base, SessionLocal, engine
from app.main import app
from app.ratelimit import guest_limiter, jam_code_limiter, login_limiter, signup_limiter

_counter = itertools.count(1)


@pytest.fixture(scope="session", autouse=True)
async def _schema() -> AsyncIterator[None]:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
async def _clean_tables() -> AsyncIterator[None]:
    yield
    tables = ", ".join(t.name for t in reversed(Base.metadata.sorted_tables))
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} CASCADE"))
    for limiter in (login_limiter, signup_limiter, jam_code_limiter, guest_limiter):
        limiter.reset()


@pytest.fixture
async def db():
    async with SessionLocal() as session:
        yield session


def new_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    async with new_client() as c:
        yield c


@dataclass
class TestUser:
    id: str
    email: str
    name: str
    password: str
    client: httpx.AsyncClient
    workspace_id: str


MakeUser = Callable[..., Awaitable[TestUser]]


@pytest.fixture
async def make_user() -> AsyncIterator[MakeUser]:
    clients: list[httpx.AsyncClient] = []

    async def _make(name: str | None = None) -> TestUser:
        n = next(_counter)
        name = name or f"User {n}"
        email = f"user{n}@example.com"
        password = "correct horse battery"
        c = new_client()
        clients.append(c)
        r = await c.post("/api/auth/signup", json={"email": email, "password": password, "name": name})
        assert r.status_code == 201, r.text
        ws = await c.get("/api/workspaces")
        workspace_id = ws.json()[0]["id"] if ws.status_code == 200 and ws.json() else ""
        return TestUser(r.json()["id"], email, name, password, c, workspace_id)

    yield _make
    for c in clients:
        await c.aclose()


import uuid
from dataclasses import field
from typing import Any

from app.models import Role, WorkspaceMember
from app.realtime.hub import hub
from app.realtime.rooms import rooms


async def add_member(workspace_id: str, user: TestUser, role: str) -> None:
    async with SessionLocal() as session:
        session.add(
            WorkspaceMember(workspace_id=uuid.UUID(workspace_id), user_id=uuid.UUID(user.id), role=Role(role))
        )
        await session.commit()


async def create_project(user: TestUser, name: str = "Project", workspace_id: str | None = None) -> dict:
    r = await user.client.post(
        f"/api/workspaces/{workspace_id or user.workspace_id}/projects", json={"name": name}
    )
    assert r.status_code == 201, r.text
    return r.json()


async def create_folder(
    user: TestUser, project_id: str, name: str = "Folder", parent_id: str | None = None
) -> dict:
    r = await user.client.post(
        f"/api/projects/{project_id}/folders", json={"name": name, "parentId": parent_id}
    )
    assert r.status_code == 201, r.text
    return r.json()


async def create_diagram(
    user: TestUser, project_id: str, name: str = "Diagram", folder_id: str | None = None
) -> dict:
    r = await user.client.post(
        f"/api/projects/{project_id}/diagrams", json={"name": name, "folderId": folder_id}
    )
    assert r.status_code == 201, r.text
    return r.json()


async def get_tree(user: TestUser, project_id: str) -> dict:
    r = await user.client.get(f"/api/projects/{project_id}/tree")
    assert r.status_code == 200, r.text
    return r.json()


async def start_jam(host: TestUser, project_id: str, access: str = "edit") -> dict:
    r = await host.client.post(f"/api/projects/{project_id}/jam", json={"access": access})
    assert r.status_code in (200, 201), r.text
    return r.json()


async def join_jam(user: TestUser, code: str) -> dict:
    r = await user.client.post(f"/api/jams/{code}/join")
    assert r.status_code == 200, r.text
    return r.json()


@dataclass
class RealtimeCalls:
    published: list[tuple[Any, dict]] = field(default_factory=list)
    hub_disconnects: list[tuple[Any, Any]] = field(default_factory=list)
    room_disconnects: list[tuple[Any, Any]] = field(default_factory=list)
    flushed: list[Any] = field(default_factory=list)
    closed: list[tuple[Any, int, str]] = field(default_factory=list)

    def events(self, project_id: str) -> list[str]:
        return [message["type"] for pid, message in self.published if str(pid) == str(project_id)]

    def closed_ids(self) -> set[str]:
        return {str(diagram_id) for diagram_id, _, _ in self.closed}

    def clear(self) -> None:
        for calls in (self.published, self.hub_disconnects, self.room_disconnects, self.flushed, self.closed):
            calls.clear()


@pytest.fixture
def realtime(monkeypatch: pytest.MonkeyPatch) -> RealtimeCalls:
    calls = RealtimeCalls()

    def spy(target: Any, name: str, record: Callable[..., None]) -> None:
        original = getattr(target, name)

        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            record(*args, **kwargs)
            return await original(*args, **kwargs)

        monkeypatch.setattr(target, name, wrapper)

    spy(hub, "publish", lambda project_id, message: calls.published.append((project_id, message)))
    spy(
        hub,
        "disconnect_users",
        lambda project_id, user_ids=None, **_: calls.hub_disconnects.append((project_id, user_ids)),
    )
    spy(
        rooms,
        "disconnect_users",
        lambda project_id, user_ids=None, **_: calls.room_disconnects.append((project_id, user_ids)),
    )
    spy(rooms, "flush", lambda diagram_id: calls.flushed.append(diagram_id))
    spy(
        rooms,
        "close_diagram",
        lambda diagram_id, code, reason: calls.closed.append((diagram_id, code, reason)),
    )
    return calls
