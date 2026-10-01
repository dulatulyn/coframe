import uuid
from datetime import timedelta

from sqlalchemy import select, update

from app.bpmn.xmlsafe import BPMN_MODEL_NS, parse_bpmn
from app.db import utcnow
from app.models import Diagram, Project
from tests.conftest import (
    MakeUser,
    RealtimeCalls,
    add_member,
    create_diagram,
    create_project,
    get_tree,
    join_jam,
    start_jam,
)

PROJECT_FIELDS = {
    "id",
    "workspaceId",
    "name",
    "createdAt",
    "updatedAt",
    "diagramCount",
    "previewDiagramId",
    "access",
    "role",
    "activeJam",
}


async def test_create_project_with_a_blank_diagram(make_user: MakeUser, db):
    owner = await make_user()
    r = await owner.client.post(
        f"/api/workspaces/{owner.workspace_id}/projects", json={"name": " Onboarding "}
    )
    assert r.status_code == 201, r.text
    project = r.json()
    assert set(project) == PROJECT_FIELDS
    assert (project["name"], project["workspaceId"], project["diagramCount"]) == (
        "Onboarding",
        owner.workspace_id,
        1,
    )
    assert (project["access"], project["role"], project["activeJam"]) == ("edit", "owner", None)

    [diagram] = (await get_tree(owner, project["id"]))["diagrams"]
    assert (diagram["name"], diagram["folderId"]) == ("Untitled diagram", None)
    assert project["previewDiagramId"] == diagram["id"]
    row = await db.get(Diagram, uuid.UUID(diagram["id"]))
    assert len(parse_bpmn(row.xml).findall(f".//{{{BPMN_MODEL_NS}}}startEvent")) == 1
    assert await db.scalar(select(Diagram.ydoc_state).where(Diagram.id == row.id)) is None


async def test_create_project_permissions(make_user: MakeUser):
    owner = await make_user()
    editor = await make_user()
    viewer = await make_user()
    stranger = await make_user()
    await add_member(owner.workspace_id, editor, "editor")
    await add_member(owner.workspace_id, viewer, "viewer")
    url = f"/api/workspaces/{owner.workspace_id}/projects"

    assert (await editor.client.post(url, json={"name": "By editor"})).status_code == 201
    r = await viewer.client.post(url, json={"name": "By viewer"})
    assert r.status_code == 403
    assert r.json()["detail"] == "forbidden"
    assert (await stranger.client.post(url, json={"name": "By stranger"})).status_code == 404
    assert (await owner.client.post(url, json={"name": "  "})).status_code == 422


async def test_list_projects_most_recently_updated_first(make_user: MakeUser):
    owner = await make_user()
    viewer = await make_user()
    stranger = await make_user()
    await add_member(owner.workspace_id, viewer, "viewer")
    first = await create_project(owner, "First")
    second = await create_project(owner, "Second")
    third = await create_project(owner, "Third")
    assert (
        await owner.client.patch(f"/api/projects/{first['id']}", json={"name": "First!"})
    ).status_code == 200
    assert (await owner.client.delete(f"/api/projects/{second['id']}")).status_code == 204
    url = f"/api/workspaces/{owner.workspace_id}/projects"

    r = await viewer.client.get(url)
    assert r.status_code == 200
    assert [p["id"] for p in r.json()] == [first["id"], third["id"]]
    assert all((p["access"], p["role"]) == ("view", "viewer") for p in r.json())
    assert (await stranger.client.get(url)).status_code == 404


async def test_get_project(make_user: MakeUser):
    owner = await make_user()
    editor = await make_user()
    viewer = await make_user()
    stranger = await make_user()
    await add_member(owner.workspace_id, editor, "editor")
    await add_member(owner.workspace_id, viewer, "viewer")
    project = await create_project(owner)
    url = f"/api/projects/{project['id']}"

    for user, access, role in (
        (owner, "edit", "owner"),
        (editor, "edit", "editor"),
        (viewer, "view", "viewer"),
    ):
        body = (await user.client.get(url)).json()
        assert (body["access"], body["role"]) == (access, role)
    r = await stranger.client.get(url)
    assert r.status_code == 404
    assert r.json()["detail"] == "project_not_found"
    assert (await owner.client.get(f"/api/projects/{uuid.uuid4()}")).status_code == 404


async def test_preview_diagram_is_the_last_edited_live_one(make_user: MakeUser, db):
    owner = await make_user()
    project = await create_project(owner)
    [original] = (await get_tree(owner, project["id"]))["diagrams"]
    newer = await create_diagram(owner, project["id"], "Newer")
    url = f"/api/projects/{project['id']}"
    assert (await owner.client.get(url)).json()["previewDiagramId"] == newer["id"]

    await db.execute(
        update(Diagram)
        .where(Diagram.id == uuid.UUID(original["id"]))
        .values(content_updated_at=utcnow() + timedelta(minutes=1))
    )
    await db.commit()
    assert (await owner.client.get(url)).json()["previewDiagramId"] == original["id"]

    assert (await owner.client.delete(f"/api/diagrams/{original['id']}")).status_code == 204
    body = (await owner.client.get(url)).json()
    assert (body["previewDiagramId"], body["diagramCount"]) == (newer["id"], 1)
    assert (await owner.client.delete(f"/api/diagrams/{newer['id']}")).status_code == 204
    body = (await owner.client.get(url)).json()
    assert (body["previewDiagramId"], body["diagramCount"]) == (None, 0)


async def test_rename_project(make_user: MakeUser, realtime: RealtimeCalls):
    owner = await make_user()
    editor = await make_user()
    viewer = await make_user()
    stranger = await make_user()
    await add_member(owner.workspace_id, editor, "editor")
    await add_member(owner.workspace_id, viewer, "viewer")
    project = await create_project(owner, "Old")
    url = f"/api/projects/{project['id']}"
    realtime.clear()

    r = await editor.client.patch(url, json={"name": " New name "})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "New name"
    assert r.json()["updatedAt"] > project["updatedAt"]
    assert realtime.events(project["id"]) == ["project"]

    assert (await viewer.client.patch(url, json={"name": "Nope"})).status_code == 403
    assert (await stranger.client.patch(url, json={"name": "Nope"})).status_code == 404
    assert (await owner.client.patch(url, json={"name": ""})).status_code == 422
    unchanged = await owner.client.patch(url, json={})
    assert unchanged.status_code == 200
    assert unchanged.json()["name"] == "New name"
    assert realtime.events(project["id"]) == ["project"]


async def test_move_project_to_another_workspace(make_user: MakeUser, realtime: RealtimeCalls):
    owner = await make_user()
    team = (await owner.client.post("/api/workspaces", json={"name": "Team"})).json()
    project = await create_project(owner)
    realtime.clear()

    r = await owner.client.patch(f"/api/projects/{project['id']}", json={"workspaceId": team["id"]})
    assert r.status_code == 200, r.text
    assert (r.json()["workspaceId"], r.json()["role"], r.json()["access"]) == (team["id"], "owner", "edit")
    assert (await owner.client.get(f"/api/workspaces/{owner.workspace_id}/projects")).json() == []
    assert [p["id"] for p in (await owner.client.get(f"/api/workspaces/{team['id']}/projects")).json()] == [
        project["id"]
    ]
    assert realtime.events(project["id"]) == ["project"]
    assert [(str(pid), ids) for pid, ids in realtime.hub_disconnects] == [(project["id"], None)]
    assert [(str(pid), ids) for pid, ids in realtime.room_disconnects] == [(project["id"], None)]


async def test_move_project_requires_admin_in_both_workspaces(make_user: MakeUser, db):
    alice = await make_user()
    bob = await make_user()
    carol = await make_user()
    dave = await make_user()
    project = await create_project(alice)
    await add_member(bob.workspace_id, alice, "editor")
    await add_member(alice.workspace_id, carol, "admin")
    await add_member(alice.workspace_id, dave, "editor")
    await add_member(bob.workspace_id, dave, "admin")
    url = f"/api/projects/{project['id']}"
    target = {"workspaceId": bob.workspace_id}

    r = await alice.client.patch(url, json=target)
    assert r.status_code == 403
    r = await carol.client.patch(url, json=target)
    assert r.status_code == 404
    assert r.json()["detail"] == "workspace_not_found"
    r = await dave.client.patch(url, json=target)
    assert r.status_code == 403
    assert await db.scalar(
        select(Project.workspace_id).where(Project.id == uuid.UUID(project["id"]))
    ) == uuid.UUID(alice.workspace_id)
    same = await alice.client.patch(url, json={"workspaceId": alice.workspace_id})
    assert same.status_code == 200


async def test_delete_project_is_soft_and_closes_its_diagrams(
    make_user: MakeUser, db, realtime: RealtimeCalls
):
    owner = await make_user()
    admin = await make_user()
    editor = await make_user()
    viewer = await make_user()
    stranger = await make_user()
    for user, role in ((admin, "admin"), (editor, "editor"), (viewer, "viewer")):
        await add_member(owner.workspace_id, user, role)
    project = await create_project(owner)
    extra = await create_diagram(owner, project["id"], "Extra")
    [first, _] = (await get_tree(owner, project["id"]))["diagrams"]
    url = f"/api/projects/{project['id']}"

    assert (await editor.client.delete(url)).status_code == 403
    assert (await viewer.client.delete(url)).status_code == 403
    assert (await stranger.client.delete(url)).status_code == 404
    realtime.clear()
    assert (await admin.client.delete(url)).status_code == 204

    assert (await owner.client.get(url)).status_code == 404
    assert (await owner.client.get(f"{url}/tree")).status_code == 404
    assert (await owner.client.get(f"/api/diagrams/{extra['id']}")).status_code == 404
    assert (await owner.client.delete(url)).status_code == 404
    row = await db.get(Project, uuid.UUID(project["id"]))
    assert row.deleted_at is not None
    assert realtime.closed_ids() == {first["id"], extra["id"]}
    assert {code for _, code, _ in realtime.closed} == {4404}
    assert realtime.events(project["id"]) == ["project"]


async def test_deleting_a_project_ends_its_jam(make_user: MakeUser, client):
    owner = await make_user()
    guest = await make_user()
    project = await create_project(owner)
    jam = await start_jam(owner, project["id"])
    await join_jam(guest, jam["code"])

    assert (await guest.client.delete(f"/api/projects/{project['id']}")).status_code == 403
    assert (await owner.client.delete(f"/api/projects/{project['id']}")).status_code == 204
    assert (await client.get(f"/api/jams/{jam['code']}")).status_code == 404
    assert (await guest.client.get(f"/api/projects/{project['id']}")).status_code == 404
    assert (await guest.client.get("/api/me/jams")).json() == []


async def test_jam_guest_sees_the_project_through_the_jam(make_user: MakeUser):
    owner = await make_user("Host")
    guest = await make_user()
    project = await create_project(owner)
    other = await create_project(owner, "Other")
    jam = await start_jam(owner, project["id"])
    await join_jam(guest, jam["code"])
    url = f"/api/projects/{project['id']}"

    body = (await guest.client.get(url)).json()
    assert (body["role"], body["access"]) == (None, "edit")
    assert body["activeJam"] == {
        "code": jam["code"],
        "access": "edit",
        "host": {"id": owner.id, "name": "Host", "color": jam["host"]["color"], "avatarUrl": None},
        "participantCount": 1,
        "expiresAt": jam["expiresAt"],
    }
    assert (await guest.client.get(f"/api/projects/{other['id']}")).status_code == 404
    assert (await guest.client.patch(url, json={"name": "Renamed by guest"})).status_code == 200
    assert (await guest.client.delete(url)).status_code == 403
    assert (await guest.client.patch(url, json={"workspaceId": guest.workspace_id})).status_code == 403

    assert (await owner.client.patch(f"{url}/jam", json={"access": "view"})).status_code == 200
    assert (await guest.client.get(url)).json()["access"] == "view"
    assert (await guest.client.patch(url, json={"name": "Nope"})).status_code == 403

    assert (await owner.client.delete(f"{url}/jam")).status_code == 204
    assert (await guest.client.get(url)).status_code == 404


async def test_pin_and_unpin_a_diagram(make_user: MakeUser):
    owner = await make_user()
    viewer = await make_user()
    await add_member(owner.workspace_id, viewer, "viewer")
    project = await create_project(owner)
    diagram = await create_diagram(owner, project["id"], "Pinned one")
    assert diagram["pinnedAt"] is None

    r = await owner.client.patch(f"/api/diagrams/{diagram['id']}", json={"pinned": True})
    assert r.status_code == 200, r.text
    pinned_at = r.json()["pinnedAt"]
    assert pinned_at is not None
    tree = await get_tree(viewer, project["id"])
    assert {d["id"]: d["pinnedAt"] for d in tree["diagrams"]}[diagram["id"]] == pinned_at

    r = await owner.client.patch(f"/api/diagrams/{diagram['id']}", json={"pinned": True})
    assert r.json()["pinnedAt"] == pinned_at

    r = await viewer.client.patch(f"/api/diagrams/{diagram['id']}", json={"pinned": False})
    assert r.status_code == 403

    r = await owner.client.patch(f"/api/diagrams/{diagram['id']}", json={"pinned": False})
    assert (r.status_code, r.json()["pinnedAt"]) == (200, None)
