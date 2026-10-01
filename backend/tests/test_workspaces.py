import uuid

from sqlalchemy import func, select

from app.models import Diagram, Folder, Project, Workspace
from tests.conftest import (
    MakeUser,
    RealtimeCalls,
    add_member,
    create_diagram,
    create_folder,
    create_project,
    join_jam,
    start_jam,
)


async def test_list_returns_personal_workspace(make_user: MakeUser):
    user = await make_user("Ada")
    r = await user.client.get("/api/workspaces")
    assert r.status_code == 200
    [workspace] = r.json()
    assert workspace == {
        "id": user.workspace_id,
        "name": "Ada's workspace",
        "role": "owner",
        "memberCount": 1,
        "projectCount": 0,
        "createdAt": workspace["createdAt"],
    }


async def test_workspace_endpoints_require_login(client):
    assert (await client.get("/api/workspaces")).status_code == 401
    assert (await client.post("/api/workspaces", json={"name": "Team"})).status_code == 401
    assert (await client.get(f"/api/workspaces/{uuid.uuid4()}")).status_code == 401


async def test_create_workspace_makes_creator_owner(make_user: MakeUser):
    user = await make_user()
    r = await user.client.post("/api/workspaces", json={"name": "  Team  "})
    assert r.status_code == 201, r.text
    body = r.json()
    assert (body["name"], body["role"], body["memberCount"], body["projectCount"]) == ("Team", "owner", 1, 0)
    listed = (await user.client.get("/api/workspaces")).json()
    assert [w["id"] for w in listed] == [user.workspace_id, body["id"]]


async def test_create_workspace_validates_name(make_user: MakeUser):
    user = await make_user()
    assert (await user.client.post("/api/workspaces", json={"name": "   "})).status_code == 422
    assert (await user.client.post("/api/workspaces", json={"name": "x" * 201})).status_code == 422
    assert (await user.client.post("/api/workspaces", json={})).status_code == 422


async def test_get_workspace_counts_and_visibility(make_user: MakeUser):
    owner = await make_user()
    viewer = await make_user()
    stranger = await make_user()
    await add_member(owner.workspace_id, viewer, "viewer")
    await create_project(owner, "Kept")
    doomed = await create_project(owner, "Deleted")
    assert (await owner.client.delete(f"/api/projects/{doomed['id']}")).status_code == 204

    r = await viewer.client.get(f"/api/workspaces/{owner.workspace_id}")
    assert r.status_code == 200
    body = r.json()
    assert (body["role"], body["memberCount"], body["projectCount"]) == ("viewer", 2, 1)

    r = await stranger.client.get(f"/api/workspaces/{owner.workspace_id}")
    assert r.status_code == 404
    assert r.json()["detail"] == "workspace_not_found"
    assert (await owner.client.get(f"/api/workspaces/{uuid.uuid4()}")).status_code == 404


async def test_rename_workspace_requires_admin(make_user: MakeUser):
    owner = await make_user()
    admin = await make_user()
    editor = await make_user()
    stranger = await make_user()
    await add_member(owner.workspace_id, admin, "admin")
    await add_member(owner.workspace_id, editor, "editor")
    url = f"/api/workspaces/{owner.workspace_id}"

    r = await admin.client.patch(url, json={"name": " Renamed "})
    assert r.status_code == 200
    assert (r.json()["name"], r.json()["role"]) == ("Renamed", "admin")
    r = await editor.client.patch(url, json={"name": "Nope"})
    assert r.status_code == 403
    assert r.json()["detail"] == "forbidden"
    assert (await stranger.client.patch(url, json={"name": "Nope"})).status_code == 404
    assert (await owner.client.patch(url, json={"name": ""})).status_code == 422
    assert (await owner.client.get(url)).json()["name"] == "Renamed"


async def test_delete_workspace_cascades(make_user: MakeUser, db, realtime: RealtimeCalls):
    owner = await make_user()
    admin = await make_user()
    team = (await owner.client.post("/api/workspaces", json={"name": "Team"})).json()
    await add_member(team["id"], admin, "admin")
    project = await create_project(owner, "Inside", workspace_id=team["id"])
    top = await create_folder(owner, project["id"], "Top")
    sub = await create_folder(owner, project["id"], "Sub", parent_id=top["id"])
    nested = await create_diagram(owner, project["id"], "Nested", folder_id=sub["id"])
    assert (await owner.client.post(f"/api/workspaces/{team['id']}/invites", json={})).status_code == 201
    realtime.clear()

    r = await admin.client.delete(f"/api/workspaces/{team['id']}")
    assert r.status_code == 403
    r = await owner.client.delete(f"/api/workspaces/{team['id']}")
    assert r.status_code == 204

    assert (await owner.client.get(f"/api/workspaces/{team['id']}")).status_code == 404
    assert (await owner.client.get(f"/api/projects/{project['id']}")).status_code == 404
    assert await db.get(Workspace, uuid.UUID(team["id"])) is None
    for model in (Project, Folder, Diagram):
        assert await db.scalar(select(func.count()).select_from(model)) == 0
    assert nested["id"] in realtime.closed_ids()
    assert realtime.events(project["id"]) == ["project"]
    assert [w["id"] for w in (await admin.client.get("/api/workspaces")).json()] == [admin.workspace_id]


async def test_cannot_delete_last_workspace(make_user: MakeUser):
    user = await make_user()
    r = await user.client.delete(f"/api/workspaces/{user.workspace_id}")
    assert r.status_code == 409
    assert r.json()["detail"] == "last_workspace"


async def test_any_other_membership_allows_deleting_own_workspace(make_user: MakeUser):
    user = await make_user()
    other = await make_user()
    await add_member(other.workspace_id, user, "viewer")
    assert (await user.client.delete(f"/api/workspaces/{user.workspace_id}")).status_code == 204
    assert [w["id"] for w in (await user.client.get("/api/workspaces")).json()] == [other.workspace_id]


async def test_delete_workspace_permissions(make_user: MakeUser):
    owner = await make_user()
    admin = await make_user()
    stranger = await make_user()
    await add_member(owner.workspace_id, admin, "admin")
    assert (await admin.client.delete(f"/api/workspaces/{owner.workspace_id}")).status_code == 403
    assert (await stranger.client.delete(f"/api/workspaces/{owner.workspace_id}")).status_code == 404


async def test_list_members(make_user: MakeUser):
    owner = await make_user("Owner")
    viewer = await make_user("Viewer")
    stranger = await make_user()
    await add_member(owner.workspace_id, viewer, "viewer")

    r = await viewer.client.get(f"/api/workspaces/{owner.workspace_id}/members")
    assert r.status_code == 200
    members = r.json()
    assert [(m["user"]["id"], m["role"]) for m in members] == [(owner.id, "owner"), (viewer.id, "viewer")]
    first = members[0]
    assert set(first) == {"user", "role", "joinedAt"}
    assert set(first["user"]) == {"id", "name", "color", "email", "avatarUrl"}
    assert first["user"]["email"] == owner.email

    r = await stranger.client.get(f"/api/workspaces/{owner.workspace_id}/members")
    assert r.status_code == 404


async def test_add_jam_participant_as_member(make_user: MakeUser, realtime: RealtimeCalls):
    owner = await make_user()
    guest = await make_user("Guest")
    outsider = await make_user()
    project = await create_project(owner)
    jam = await start_jam(owner, project["id"])
    await join_jam(guest, jam["code"])
    url = f"/api/workspaces/{owner.workspace_id}/members"

    r = await owner.client.post(url, json={"userId": outsider.id})
    assert r.status_code == 403
    assert r.json()["detail"] == "not_jam_participant"
    r = await owner.client.post(url, json={"userId": str(uuid.uuid4())})
    assert r.status_code == 403
    assert r.json()["detail"] == "not_jam_participant"

    realtime.clear()
    r = await owner.client.post(url, json={"userId": guest.id})
    assert r.status_code == 201, r.text
    body = r.json()
    assert (body["user"]["id"], body["user"]["email"], body["role"]) == (guest.id, guest.email, "editor")
    assert realtime.events(project["id"]) == ["jam"]
    participants = (await owner.client.get(f"/api/projects/{project['id']}/jam")).json()["participants"]
    assert [(p["user"]["id"], p["isMember"]) for p in participants] == [(guest.id, True)]
    guest_workspaces = (await guest.client.get("/api/workspaces")).json()
    assert {(w["id"], w["role"]) for w in guest_workspaces} == {
        (guest.workspace_id, "owner"),
        (owner.workspace_id, "editor"),
    }

    r = await owner.client.post(url, json={"userId": guest.id})
    assert r.status_code == 409
    assert r.json()["detail"] == "already_member"


async def test_participant_of_an_ended_jam_can_still_be_added(make_user: MakeUser):
    owner = await make_user()
    guest = await make_user()
    project = await create_project(owner)
    jam = await start_jam(owner, project["id"])
    await join_jam(guest, jam["code"])
    assert (await owner.client.delete(f"/api/projects/{project['id']}/jam")).status_code == 204
    r = await owner.client.post(
        f"/api/workspaces/{owner.workspace_id}/members", json={"userId": guest.id, "role": "viewer"}
    )
    assert r.status_code == 201
    assert r.json()["role"] == "viewer"


async def test_add_member_permissions(make_user: MakeUser):
    owner = await make_user()
    admin = await make_user()
    editor = await make_user()
    guest = await make_user()
    stranger = await make_user()
    await add_member(owner.workspace_id, admin, "admin")
    await add_member(owner.workspace_id, editor, "editor")
    project = await create_project(owner)
    await join_jam(guest, (await start_jam(owner, project["id"]))["code"])
    url = f"/api/workspaces/{owner.workspace_id}/members"

    assert (await editor.client.post(url, json={"userId": guest.id})).status_code == 403
    assert (await stranger.client.post(url, json={"userId": guest.id})).status_code == 404
    r = await admin.client.post(url, json={"userId": guest.id, "role": "owner"})
    assert r.status_code == 403
    assert r.json()["detail"] == "forbidden"
    r = await owner.client.post(url, json={"userId": guest.id, "role": "owner"})
    assert r.status_code == 201
    assert r.json()["role"] == "owner"


async def test_change_member_role(make_user: MakeUser):
    owner = await make_user()
    admin = await make_user()
    editor = await make_user()
    stranger = await make_user()
    await add_member(owner.workspace_id, admin, "admin")
    await add_member(owner.workspace_id, editor, "editor")
    base = f"/api/workspaces/{owner.workspace_id}/members"

    r = await admin.client.patch(f"{base}/{editor.id}", json={"role": "viewer"})
    assert r.status_code == 200
    assert (r.json()["user"]["id"], r.json()["role"]) == (editor.id, "viewer")
    assert (await admin.client.patch(f"{base}/{editor.id}", json={"role": "owner"})).status_code == 403
    assert (await admin.client.patch(f"{base}/{owner.id}", json={"role": "admin"})).status_code == 403
    assert (await editor.client.patch(f"{base}/{admin.id}", json={"role": "viewer"})).status_code == 403
    assert (await stranger.client.patch(f"{base}/{admin.id}", json={"role": "viewer"})).status_code == 404

    r = await owner.client.patch(f"{base}/{admin.id}", json={"role": "owner"})
    assert r.status_code == 200
    assert r.json()["role"] == "owner"
    r = await owner.client.patch(f"{base}/{uuid.uuid4()}", json={"role": "viewer"})
    assert r.status_code == 404
    assert r.json()["detail"] == "member_not_found"
    assert (await owner.client.patch(f"{base}/{admin.id}", json={"role": "boss"})).status_code == 422


async def test_last_owner_cannot_be_demoted(make_user: MakeUser):
    owner = await make_user()
    other = await make_user()
    await add_member(owner.workspace_id, other, "admin")
    base = f"/api/workspaces/{owner.workspace_id}/members"

    r = await owner.client.patch(f"{base}/{owner.id}", json={"role": "admin"})
    assert r.status_code == 409
    assert r.json()["detail"] == "last_owner"
    assert (await owner.client.patch(f"{base}/{owner.id}", json={"role": "owner"})).status_code == 200

    assert (await owner.client.patch(f"{base}/{other.id}", json={"role": "owner"})).status_code == 200
    r = await owner.client.patch(f"{base}/{owner.id}", json={"role": "editor"})
    assert r.status_code == 200
    assert r.json()["role"] == "editor"


async def test_remove_member(make_user: MakeUser, realtime: RealtimeCalls):
    owner = await make_user()
    admin = await make_user()
    editor = await make_user()
    viewer = await make_user()
    for user, role in ((admin, "admin"), (editor, "editor"), (viewer, "viewer")):
        await add_member(owner.workspace_id, user, role)
    first = await create_project(owner, "First")
    second = await create_project(owner, "Second")
    base = f"/api/workspaces/{owner.workspace_id}/members"

    assert (await viewer.client.delete(f"{base}/{editor.id}")).status_code == 403
    r = await admin.client.delete(f"{base}/{owner.id}")
    assert r.status_code == 403
    r = await admin.client.delete(f"{base}/{uuid.uuid4()}")
    assert r.status_code == 404
    assert r.json()["detail"] == "member_not_found"

    realtime.clear()
    assert (await admin.client.delete(f"{base}/{editor.id}")).status_code == 204
    assert (await editor.client.get(f"/api/workspaces/{owner.workspace_id}")).status_code == 404
    assert (await editor.client.get(f"/api/projects/{first['id']}")).status_code == 404
    expected = {(first["id"], frozenset({editor.id})), (second["id"], frozenset({editor.id}))}
    for calls in (realtime.hub_disconnects, realtime.room_disconnects):
        assert {(str(pid), frozenset(map(str, ids))) for pid, ids in calls} == expected


async def test_leave_workspace(make_user: MakeUser):
    owner = await make_user()
    viewer = await make_user()
    co_owner = await make_user()
    await add_member(owner.workspace_id, viewer, "viewer")
    base = f"/api/workspaces/{owner.workspace_id}/members"

    assert (await viewer.client.delete(f"{base}/{viewer.id}")).status_code == 204
    assert (await viewer.client.get(f"/api/workspaces/{owner.workspace_id}")).status_code == 404

    r = await owner.client.delete(f"{base}/{owner.id}")
    assert r.status_code == 409
    assert r.json()["detail"] == "last_owner"

    await add_member(owner.workspace_id, co_owner, "owner")
    assert (await owner.client.delete(f"{base}/{owner.id}")).status_code == 204
    members = (await co_owner.client.get(base)).json()
    assert [m["user"]["id"] for m in members] == [co_owner.id]


async def test_owner_can_remove_another_owner(make_user: MakeUser):
    owner = await make_user()
    co_owner = await make_user()
    await add_member(owner.workspace_id, co_owner, "owner")
    assert (
        await owner.client.delete(f"/api/workspaces/{owner.workspace_id}/members/{co_owner.id}")
    ).status_code == 204


async def test_search_projects_and_diagrams(make_user: MakeUser):
    owner = await make_user("Owner")
    viewer = await make_user()
    stranger = await make_user()
    other = await make_user()
    await add_member(owner.workspace_id, viewer, "viewer")
    order = await create_project(owner, "Order process")
    billing = await create_project(owner, "Billing")
    await create_project(owner, "Old orders")
    intake = await create_diagram(owner, billing["id"], "ORDER intake")
    await create_diagram(owner, billing["id"], "Payment")
    trashed = await create_diagram(owner, billing["id"], "Order draft")
    assert (await owner.client.delete(f"/api/diagrams/{trashed['id']}")).status_code == 204
    gone = await create_project(owner, "Order archive")
    assert (await owner.client.delete(f"/api/projects/{gone['id']}")).status_code == 204
    foreign = await create_project(other, "Order elsewhere")
    await create_diagram(other, foreign["id"], "Order elsewhere diagram")

    r = await viewer.client.get(f"/api/workspaces/{owner.workspace_id}/search", params={"q": "  order "})
    assert r.status_code == 200, r.text
    body = r.json()
    assert {p["name"] for p in body["projects"]} == {"Order process", "Old orders"}
    assert all(p["access"] == "view" and p["role"] == "viewer" for p in body["projects"])
    [diagram] = body["diagrams"]
    assert diagram["id"] == intake["id"]
    assert (diagram["projectName"], diagram["workspaceId"], diagram["workspaceName"]) == (
        "Billing",
        owner.workspace_id,
        "Owner's workspace",
    )
    assert diagram["updatedBy"]["id"] == owner.id

    assert order["id"] in {p["id"] for p in body["projects"]}
    r = await stranger.client.get(f"/api/workspaces/{owner.workspace_id}/search", params={"q": "order"})
    assert r.status_code == 404


async def test_search_escapes_like_wildcards(make_user: MakeUser):
    owner = await make_user()
    await create_project(owner, "100% done")
    await create_project(owner, "under_score")
    await create_project(owner, "plain")
    url = f"/api/workspaces/{owner.workspace_id}/search"
    for q, expected in (("%", {"100% done"}), ("_", {"under_score"}), ("\\", set())):
        body = (await owner.client.get(url, params={"q": q})).json()
        assert {p["name"] for p in body["projects"]} == expected, q


async def test_search_validates_query(make_user: MakeUser):
    owner = await make_user()
    url = f"/api/workspaces/{owner.workspace_id}/search"
    for params in ({"q": ""}, {"q": "   "}, {"q": "x" * 101}, {}):
        assert (await owner.client.get(url, params=params)).status_code == 422, params
    assert (await owner.client.get(url, params={"q": "x" * 100})).status_code == 200


async def test_search_returns_at_most_20_of_each(make_user: MakeUser):
    owner = await make_user()
    project = await create_project(owner, "Match project")
    for n in range(21):
        await create_diagram(owner, project["id"], f"Match {n}")
    for n in range(20):
        await create_project(owner, f"Match {n}")
    body = (
        await owner.client.get(f"/api/workspaces/{owner.workspace_id}/search", params={"q": "match"})
    ).json()
    assert len(body["projects"]) == 20
    assert len(body["diagrams"]) == 20
