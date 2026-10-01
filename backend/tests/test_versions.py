import asyncio
import uuid
from contextlib import asynccontextmanager

import pytest
from pycrdt import Map
from sqlalchemy import func, select

from app.config import settings
from app.models import DiagramVersion
from app.realtime.rooms import rooms
from tests.conftest import MakeUser, add_member, create_project, get_tree
from tests.ywire import eventually, login, ws_client, ydiagram


@pytest.fixture(autouse=True)
async def fast_rooms(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ydoc_save_delay", 0.05)
    monkeypatch.setattr(settings, "room_unload_delay", 0.05)
    monkeypatch.setattr(settings, "version_interval", 0.0)
    yield
    await rooms.shutdown()


@asynccontextmanager
async def connected(user):
    async with ws_client() as client:
        await login(client, user.email, user.password)
        yield client


async def setup_diagram(make_user: MakeUser):
    owner = await make_user("Owner")
    project = await create_project(owner, "Versions")
    diagram_id = (await get_tree(owner, project["id"]))["diagrams"][0]["id"]
    return owner, project, diagram_id


async def add_task(y, key: str, name: str) -> None:
    process = next(k for k, e in y.read().items() if e["t"] == "bpmn:process")
    with y.doc.transaction():
        y.elements[key] = Map({"t": "bpmn:task", "p": process, "o": f"z{key}", "@name": name})
    await y.flush()


async def versions(user, diagram_id: str) -> list[dict]:
    r = await user.client.get(f"/api/diagrams/{diagram_id}/versions")
    assert r.status_code == 200, r.text
    return r.json()


async def version_xml(user, diagram_id: str, version_id: str) -> str:
    r = await user.client.get(f"/api/diagrams/{diagram_id}/versions/{version_id}/xml")
    assert r.status_code == 200, r.text
    return r.text


async def test_live_edits_are_kept_as_versions(make_user: MakeUser, db):
    owner, _, diagram_id = await setup_diagram(make_user)
    async with connected(owner) as client, ydiagram(client, diagram_id) as y:
        await asyncio.wait_for(y.synced.wait(), 3)
        await add_task(y, "Task_a", "Draft")
        await eventually(lambda: len(y.persisted) > 0)
        await add_task(y, "Task_b", "Review")
        await eventually(lambda: "Task_b" in (rooms.get_loaded(uuid.UUID(diagram_id))._last_xml or ""))

    listed = await versions(owner, diagram_id)
    assert listed and all(v["source"] == "auto" for v in listed)
    assert listed[0]["author"]["id"] == owner.id
    latest = await version_xml(owner, diagram_id, listed[0]["id"])
    assert 'name="Draft"' in latest and 'name="Review"' in latest
    oldest = await version_xml(owner, diagram_id, listed[-1]["id"])
    assert 'name="Review"' not in oldest


async def test_unchanged_content_is_not_versioned_twice(make_user: MakeUser, db):
    owner, _, diagram_id = await setup_diagram(make_user)
    async with connected(owner) as client, ydiagram(client, diagram_id) as y:
        await asyncio.wait_for(y.synced.wait(), 3)
        await add_task(y, "Task_a", "Draft")
        await eventually(lambda: len(y.persisted) > 0)
    first = len(await versions(owner, diagram_id))
    assert first == len(await versions(owner, diagram_id))
    count = await db.scalar(select(func.count()).where(DiagramVersion.diagram_id == uuid.UUID(diagram_id)))
    assert count == first


async def test_restoring_a_version_replaces_the_content_for_everyone(make_user: MakeUser):
    owner, _, diagram_id = await setup_diagram(make_user)
    viewer = await make_user("Viewer")
    await add_member(owner.workspace_id, viewer, "viewer")
    generation = (await owner.client.get(f"/api/diagrams/{diagram_id}")).json()["generation"]

    async with connected(owner) as client, ydiagram(client, diagram_id) as y:
        await asyncio.wait_for(y.synced.wait(), 3)
        await add_task(y, "Task_a", "Kept")
        await eventually(lambda: len(y.persisted) > 0)
        early = (await versions(owner, diagram_id))[0]
        await add_task(y, "Task_b", "Mistake")
        await eventually(lambda: "Mistake" in (rooms.get_loaded(uuid.UUID(diagram_id))._last_xml or ""))

        r = await viewer.client.post(f"/api/diagrams/{diagram_id}/versions/{early['id']}/restore")
        assert r.status_code == 403

        r = await owner.client.post(f"/api/diagrams/{diagram_id}/versions/{early['id']}/restore")
        assert r.status_code == 200, r.text
        assert (r.json()["source"], r.json()["author"]["id"]) == ("restore", owner.id)
        await eventually(lambda: y.closed is not None)
        assert y.closed.code == 4409

    diagram = (await owner.client.get(f"/api/diagrams/{diagram_id}")).json()
    assert diagram["generation"] == generation + 1
    xml = (await owner.client.get(f"/api/diagrams/{diagram_id}/xml")).text
    assert 'name="Kept"' in xml and "Mistake" not in xml

    listed = await versions(owner, diagram_id)
    assert listed[0]["source"] == "restore"
    earlier = [await version_xml(owner, diagram_id, v["id"]) for v in listed[1:]]
    assert any("Mistake" in xml for xml in earlier)

    async with connected(owner) as client, ydiagram(client, diagram_id) as y:
        await asyncio.wait_for(y.synced.wait(), 3)
        names = {e.get("@name") for e in y.read().values()}
        assert "Kept" in names and "Mistake" not in names


async def test_versions_belong_to_their_diagram(make_user: MakeUser):
    owner, project, diagram_id = await setup_diagram(make_user)
    created = await owner.client.post(f"/api/projects/{project['id']}/diagrams", json={"name": "Other"})
    other = created.json()
    async with connected(owner) as client, ydiagram(client, diagram_id) as y:
        await asyncio.wait_for(y.synced.wait(), 3)
        await add_task(y, "Task_a", "Draft")
        await eventually(lambda: len(y.persisted) > 0)
    [version, *_] = await versions(owner, diagram_id)
    r = await owner.client.get(f"/api/diagrams/{other['id']}/versions/{version['id']}/xml")
    assert r.status_code == 404
    stranger = await make_user("Stranger")
    r = await stranger.client.get(f"/api/diagrams/{diagram_id}/versions")
    assert r.status_code in (403, 404)
