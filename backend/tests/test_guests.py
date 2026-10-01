import uuid
from datetime import timedelta

from sqlalchemy import select, update

from app.db import utcnow
from app.models import User, UserSession, Workspace
from app.services.guests import purge_guests
from tests.conftest import MakeUser, create_project, get_tree, new_client, start_jam


async def start_guest(client) -> dict:
    r = await client.post("/api/auth/guest")
    assert r.status_code == 201, r.text
    return r.json()


async def test_guest_gets_an_anonymous_identity_and_a_workspace(client):
    guest = await start_guest(client)
    assert guest["isGuest"] is True
    assert guest["email"] is None
    assert guest["name"].startswith("Anonymous ")
    assert guest["hasPassword"] is False

    me = await client.get("/api/auth/me")
    assert me.json()["id"] == guest["id"]
    [workspace] = (await client.get("/api/workspaces")).json()
    assert (workspace["name"], workspace["role"]) == ("Guest workspace", "owner")

    again = await client.post("/api/auth/guest")
    assert (again.status_code, again.json()["id"]) == (200, guest["id"])


async def test_signed_in_users_stay_themselves(make_user: MakeUser):
    user = await make_user()
    r = await user.client.post("/api/auth/guest")
    assert (r.status_code, r.json()["id"], r.json()["isGuest"]) == (200, user.id, False)


async def test_guest_joins_a_jam_and_edits(make_user: MakeUser, client):
    host = await make_user()
    project = await create_project(host)
    jam = await start_jam(host, project["id"])
    guest = await start_guest(client)

    r = await client.post(f"/api/jams/{jam['code']}/join")
    assert r.status_code == 200, r.text
    tree = await get_tree(host, project["id"])
    diagram_id = tree["diagrams"][0]["id"]
    r = await client.patch(f"/api/diagrams/{diagram_id}", json={"name": "Renamed by a guest"})
    assert r.status_code == 200, r.text

    participants = (await host.client.get(f"/api/projects/{project['id']}/jam")).json()["participants"]
    assert guest["id"] in {p["user"]["id"] for p in participants}


async def test_signup_turns_the_guest_into_an_account(client, db):
    guest = await start_guest(client)
    [workspace] = (await client.get("/api/workspaces")).json()
    created = await client.post(f"/api/workspaces/{workspace['id']}/projects", json={"name": "Draft"})
    project = created.json()
    old_cookie = client.cookies.get("sid")

    r = await client.post(
        "/api/auth/signup", json={"email": "Saved@Example.com", "password": "long enough", "name": "Dana"}
    )
    assert r.status_code == 201, r.text
    user = r.json()
    assert (user["id"], user["isGuest"], user["email"], user["name"]) == (
        guest["id"],
        False,
        "saved@example.com",
        "Dana",
    )
    [workspace] = (await client.get("/api/workspaces")).json()
    assert workspace["name"] == "Dana's workspace"
    assert (await client.get(f"/api/projects/{project['id']}")).status_code == 200

    async with new_client() as stale:
        stale.cookies.set("sid", old_cookie)
        assert (await stale.get("/api/auth/me")).status_code == 401

    async with new_client() as other:
        credentials = {"email": "saved@example.com", "password": "long enough"}
        r = await other.post("/api/auth/login", json=credentials)
        assert r.status_code == 200, r.text


async def test_signup_as_guest_with_a_taken_email_keeps_the_guest(make_user: MakeUser, client):
    existing = await make_user()
    guest = await start_guest(client)
    r = await client.post(
        "/api/auth/signup", json={"email": existing.email, "password": "long enough", "name": "Dana"}
    )
    assert (r.status_code, r.json()["detail"]) == (409, "email_taken")
    assert (await client.get("/api/auth/me")).json()["id"] == guest["id"]


async def test_login_keeps_what_the_guest_made(make_user: MakeUser, client, db):
    account = await make_user()
    guest = await start_guest(client)
    [guest_workspace] = (await client.get("/api/workspaces")).json()
    project = (
        await client.post(f"/api/workspaces/{guest_workspace['id']}/projects", json={"name": "Draft"})
    ).json()

    r = await client.post("/api/auth/login", json={"email": account.email, "password": account.password})
    assert (r.status_code, r.json()["id"]) == (200, account.id)
    names = {w["name"] for w in (await client.get("/api/workspaces")).json()}
    assert names == {f"{account.name}'s workspace", "Guest workspace"}
    assert (await client.get(f"/api/projects/{project['id']}")).status_code == 200
    assert await db.get(User, uuid.UUID(guest["id"])) is None


async def test_login_drops_an_empty_guest_workspace(make_user: MakeUser, client, db):
    account = await make_user()
    await start_guest(client)
    [guest_workspace] = (await client.get("/api/workspaces")).json()

    r = await client.post("/api/auth/login", json={"email": account.email, "password": account.password})
    assert r.status_code == 200, r.text
    workspaces = (await client.get("/api/workspaces")).json()
    assert [w["name"] for w in workspaces] == [f"{account.name}'s workspace"]
    assert await db.get(Workspace, uuid.UUID(guest_workspace["id"])) is None


async def test_guests_cannot_set_a_password(client):
    await start_guest(client)
    r = await client.patch("/api/auth/me", json={"newPassword": "long enough"})
    assert (r.status_code, r.json()["detail"]) == (400, "sign_up_first")
    r = await client.patch("/api/auth/me", json={"name": "Quiet Otter"})
    assert (r.status_code, r.json()["name"]) == (200, "Quiet Otter")


async def test_inactive_guests_are_purged(make_user: MakeUser, client, db):
    member = await make_user()
    guest = await start_guest(client)
    [workspace] = (await client.get("/api/workspaces")).json()
    async with new_client() as other:
        fresh = await start_guest(other)

    long_ago = utcnow() - timedelta(days=40)
    guest_id = uuid.UUID(guest["id"])
    await db.execute(update(User).where(User.id == guest_id).values(created_at=long_ago))
    await db.execute(update(UserSession).where(UserSession.user_id == guest_id).values(expires_at=long_ago))
    await db.commit()

    assert await purge_guests(db) == 1
    remaining = set(await db.scalars(select(User.id)))
    assert remaining == {uuid.UUID(member.id), uuid.UUID(fresh["id"])}
    assert await db.get(Workspace, uuid.UUID(workspace["id"])) is None
