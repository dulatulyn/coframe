import asyncio
import json
import uuid
from contextlib import asynccontextmanager

import pytest
from httpx_ws import WebSocketDisconnect, aconnect_ws
from pycrdt import Map
from sqlalchemy import select

from app.config import settings
from app.models import Diagram
from app.realtime.rooms import rooms
from tests.conftest import MakeUser, add_member, create_project, get_tree, join_jam, start_jam
from tests.ywire import eventually, login, ws_client, ydiagram


@pytest.fixture(autouse=True)
async def fast_rooms(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ydoc_save_delay", 0.05)
    monkeypatch.setattr(settings, "room_unload_delay", 0.05)
    yield
    await rooms.shutdown()


async def setup_diagram(make_user: MakeUser):
    owner = await make_user("Owner")
    project = await create_project(owner, "Realtime")
    diagram_id = (await get_tree(owner, project["id"]))["diagrams"][0]["id"]
    return owner, project, diagram_id


@asynccontextmanager
async def connected(user):
    async with ws_client() as client:
        await login(client, user.email, user.password)
        yield client


async def test_initial_sync_builds_the_document_from_xml(make_user: MakeUser):
    owner, _, diagram_id = await setup_diagram(make_user)
    async with connected(owner) as client, ydiagram(client, diagram_id) as y:
        await asyncio.wait_for(y.synced.wait(), 3)
        elements = y.read()
        kinds = {e["t"] for e in elements.values()}
        assert {"bpmn:definitions", "bpmn:process", "bpmn:startEvent", "bpmndi:BPMNShape"} <= kinds


async def test_edits_reach_other_clients_and_are_saved(make_user: MakeUser, db):
    owner, project, diagram_id = await setup_diagram(make_user)
    editor = await make_user("Editor")
    await add_member(owner.workspace_id, editor, "editor")

    async with connected(owner) as c1, connected(editor) as c2:
        async with ydiagram(c1, diagram_id) as a, ydiagram(c2, diagram_id) as b:
            await asyncio.wait_for(a.synced.wait(), 3)
            await asyncio.wait_for(b.synced.wait(), 3)
            process = next(k for k, e in a.read().items() if e["t"] == "bpmn:process")
            with a.doc.transaction():
                a.elements["Task_new"] = Map({"t": "bpmn:task", "p": process, "o": "zz", "@name": "Review"})
            await a.flush()
            await eventually(lambda: b.read().get("Task_new", {}).get("@name") == "Review")
            await eventually(lambda: len(a.persisted) > 0 and len(b.persisted) > 0)

    row = (
        await db.execute(
            select(Diagram.xml, Diagram.ydoc_state, Diagram.updated_by).where(Diagram.id == diagram_id)
        )
    ).one()
    assert 'id="Task_new"' in row.xml and 'name="Review"' in row.xml
    assert row.ydoc_state
    assert str(row.updated_by) == owner.id


async def test_view_only_clients_cannot_change_the_document(make_user: MakeUser):
    owner, project, diagram_id = await setup_diagram(make_user)
    guest = await make_user("Guest")
    jam = await start_jam(owner, project["id"], access="view")
    await join_jam(guest, jam["code"])

    async with connected(owner) as c1, connected(guest) as c2:
        async with ydiagram(c1, diagram_id) as host, ydiagram(c2, diagram_id) as viewer:
            await asyncio.wait_for(viewer.synced.wait(), 3)
            await asyncio.wait_for(host.synced.wait(), 3)
            with viewer.doc.transaction():
                viewer.elements["Hacked"] = Map({"t": "bpmn:task", "p": "x", "o": "a0"})
            await viewer.flush()
            await asyncio.sleep(0.2)
            assert "Hacked" not in host.read()
            assert "Hacked" not in rooms.get_loaded(uuid.UUID(diagram_id)).elements()


async def test_awareness_carries_the_real_user_and_is_removed_on_leave(make_user: MakeUser):
    owner, _, diagram_id = await setup_diagram(make_user)
    other = await make_user("Other")
    await add_member(owner.workspace_id, other, "editor")

    async with connected(owner) as c1, connected(other) as c2, ydiagram(c1, diagram_id) as watcher:
        await asyncio.wait_for(watcher.synced.wait(), 3)
        async with ydiagram(c2, diagram_id) as moving:
            await asyncio.wait_for(moving.synced.wait(), 3)
            await moving.set_awareness(4242, 1, {"user": {"name": "Impostor"}, "cursor": {"x": 10, "y": 20}})
            await eventually(lambda: 4242 in watcher.awareness)
            state = json.loads(watcher.awareness[4242].state)
            assert state["user"] == {
                "id": other.id,
                "name": "Other",
                "color": state["user"]["color"],
                "avatarUrl": None,
            }
            assert state["cursor"] == {"x": 10, "y": 20}
            await eventually(lambda: 4242 in moving.awareness)
        await eventually(lambda: 4242 not in watcher.awareness)


async def test_connection_refusals_use_application_close_codes(make_user: MakeUser):
    owner, _, diagram_id = await setup_diagram(make_user)
    stranger = await make_user("Stranger")

    async def close_code(client, target: str, headers=None) -> int:
        async with aconnect_ws(
            f"http://testserver/api/ws/diagrams/{target}", client, headers=headers or {}
        ) as ws:
            with pytest.raises(WebSocketDisconnect) as exc:
                await ws.receive_bytes()
            return exc.value.code

    async with ws_client() as anonymous:
        assert await close_code(anonymous, diagram_id) == 4401
    async with connected(stranger) as c:
        assert await close_code(c, diagram_id) == 4403
        assert await close_code(c, "not-a-uuid") == 4404
    async with connected(owner) as c:
        assert await close_code(c, diagram_id, headers={"origin": "https://evil.example"}) == 4403


async def test_trashing_a_diagram_disconnects_its_editors(make_user: MakeUser):
    owner, _, diagram_id = await setup_diagram(make_user)
    async with connected(owner) as client, ydiagram(client, diagram_id) as y:
        await asyncio.wait_for(y.synced.wait(), 3)
        r = await owner.client.delete(f"/api/diagrams/{diagram_id}")
        assert r.status_code == 204
        await eventually(lambda: y.closed is not None)
        assert y.closed.code == 4404


async def test_ending_a_jam_disconnects_guests_but_not_members(make_user: MakeUser):
    owner, project, diagram_id = await setup_diagram(make_user)
    guest = await make_user("Guest")
    jam = await start_jam(owner, project["id"], access="edit")
    await join_jam(guest, jam["code"])

    async with connected(owner) as c1, connected(guest) as c2:
        async with ydiagram(c1, diagram_id) as host, ydiagram(c2, diagram_id) as visitor:
            await asyncio.wait_for(visitor.synced.wait(), 3)
            r = await owner.client.delete(f"/api/projects/{project['id']}/jam")
            assert r.status_code == 204
            await eventually(lambda: visitor.closed is not None)
            assert visitor.closed.code == 4403
            await asyncio.sleep(0.1)
            assert host.closed is None


async def test_project_channel_presence_and_tree_events(make_user: MakeUser):
    owner, project, diagram_id = await setup_diagram(make_user)
    mate = await make_user("Mate")
    await add_member(owner.workspace_id, mate, "editor")
    url = f"http://testserver/api/ws/projects/{project['id']}"

    async def next_message(ws, kind: str) -> dict:
        while True:
            message = json.loads(await asyncio.wait_for(ws.receive_text(), 3))
            if message["type"] == kind:
                return message

    async with connected(owner) as c1, connected(mate) as c2:
        async with aconnect_ws(url, c1) as a, aconnect_ws(url, c2) as b:
            await next_message(a, "presence")
            await b.send_text(json.dumps({"type": "presence", "diagramId": diagram_id}))
            while True:
                presence = await next_message(a, "presence")
                entries = {u["user"]["name"]: u["diagramId"] for u in presence["users"]}
                if entries.get("Mate") == diagram_id:
                    break
            assert entries["Owner"] is None

            r = await owner.client.post(f"/api/projects/{project['id']}/folders", json={"name": "Specs"})
            assert r.status_code == 201
            assert (await next_message(b, "tree")) == {"type": "tree"}

            await a.send_text(json.dumps({"type": "ping"}))
            assert (await next_message(a, "pong")) == {"type": "pong"}


async def test_changes_arriving_while_saving_are_saved_too(make_user: MakeUser, db, monkeypatch):
    from app.realtime import rooms as rooms_module

    owner, _, diagram_id = await setup_diagram(make_user)
    async with connected(owner) as client, ydiagram(client, diagram_id) as y:
        await asyncio.wait_for(y.synced.wait(), 3)
        room = rooms.get_loaded(uuid.UUID(diagram_id))
        original = rooms_module.reconstruct_xml
        injected = []

        def reconstruct_during_edit(elements):
            if not injected:
                injected.append(True)
                process = next(k for k, e in elements.items() if e["t"] == "bpmn:process")
                with room.doc.transaction():
                    room.doc.get("elements", type=Map)["Late"] = Map(
                        {"t": "bpmn:task", "p": process, "o": "zzz", "@name": "Late"}
                    )
                room.mark_dirty(uuid.UUID(owner.id))
            return original(elements)

        monkeypatch.setattr(rooms_module, "reconstruct_xml", reconstruct_during_edit)
        process = next(k for k, e in y.read().items() if e["t"] == "bpmn:process")
        with y.doc.transaction():
            y.elements["Early"] = Map({"t": "bpmn:task", "p": process, "o": "zz", "@name": "Early"})
        await y.flush()
        await eventually(lambda: bool(injected) and not room.dirty)

    xml = await db.scalar(select(Diagram.xml).where(Diagram.id == diagram_id))
    assert 'name="Early"' in xml and 'name="Late"' in xml
