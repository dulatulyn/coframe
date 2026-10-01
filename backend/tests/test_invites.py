import uuid
from datetime import datetime, timedelta

from sqlalchemy import select, update

from app.db import utcnow
from app.models import WorkspaceInvite
from tests.conftest import MakeUser, add_member
from tests.conftest import TestUser as ApiUser


async def create_invite(user: ApiUser, workspace_id: str, role: str = "editor") -> dict:
    r = await user.client.post(f"/api/workspaces/{workspace_id}/invites", json={"role": role})
    assert r.status_code == 201, r.text
    return r.json()


async def expire(db, invite: dict) -> None:
    await db.execute(
        update(WorkspaceInvite)
        .where(WorkspaceInvite.id == uuid.UUID(invite["id"]))
        .values(expires_at=utcnow() - timedelta(seconds=1))
    )
    await db.commit()


async def test_create_invite(make_user: MakeUser):
    owner = await make_user()
    admin = await make_user("Admin")
    await add_member(owner.workspace_id, admin, "admin")

    invite = await create_invite(admin, owner.workspace_id, "viewer")
    assert set(invite) == {"id", "token", "role", "createdAt", "expiresAt", "createdBy"}
    assert invite["role"] == "viewer"
    assert len(invite["token"]) >= 32
    assert invite["createdBy"] == {
        "id": admin.id,
        "name": "Admin",
        "color": invite["createdBy"]["color"],
        "avatarUrl": None,
    }
    ttl = datetime.fromisoformat(invite["expiresAt"]) - datetime.fromisoformat(invite["createdAt"])
    assert ttl == timedelta(days=7)

    url = f"/api/workspaces/{owner.workspace_id}/invites"
    assert (await admin.client.post(url, json={})).json()["role"] == "editor"
    assert (await admin.client.post(url)).json()["role"] == "editor"
    assert (await admin.client.post(url, json={"role": "guest"})).status_code == 422


async def test_create_invite_permissions(make_user: MakeUser):
    owner = await make_user()
    admin = await make_user()
    editor = await make_user()
    stranger = await make_user()
    await add_member(owner.workspace_id, admin, "admin")
    await add_member(owner.workspace_id, editor, "editor")
    url = f"/api/workspaces/{owner.workspace_id}/invites"

    r = await editor.client.post(url, json={"role": "viewer"})
    assert r.status_code == 403
    assert r.json()["detail"] == "forbidden"
    assert (await stranger.client.post(url, json={"role": "viewer"})).status_code == 404
    assert (await admin.client.post(url, json={"role": "owner"})).status_code == 403
    assert (await owner.client.post(url, json={"role": "owner"})).status_code == 201


async def test_list_invites_shows_only_usable_ones(make_user: MakeUser, db):
    owner = await make_user()
    editor = await make_user()
    stranger = await make_user()
    await add_member(owner.workspace_id, editor, "editor")
    older = await create_invite(owner, owner.workspace_id, "viewer")
    newer = await create_invite(owner, owner.workspace_id, "admin")
    revoked = await create_invite(owner, owner.workspace_id)
    expired = await create_invite(owner, owner.workspace_id)
    assert (await owner.client.delete(f"/api/invites/{revoked['id']}")).status_code == 204
    await expire(db, expired)
    url = f"/api/workspaces/{owner.workspace_id}/invites"

    r = await owner.client.get(url)
    assert r.status_code == 200
    assert [i["id"] for i in r.json()] == [newer["id"], older["id"]]
    assert (await editor.client.get(url)).status_code == 403
    assert (await stranger.client.get(url)).status_code == 404


async def test_invite_preview_is_public(make_user: MakeUser, client, db):
    owner = await make_user("Owner")
    invite = await create_invite(owner, owner.workspace_id, "viewer")

    r = await client.get(f"/api/invites/{invite['token']}")
    assert r.status_code == 200
    body = r.json()
    assert body == {
        "workspace": {"id": owner.workspace_id, "name": "Owner's workspace"},
        "role": "viewer",
        "invitedBy": {
            "id": owner.id,
            "name": "Owner",
            "color": body["invitedBy"]["color"],
            "avatarUrl": None,
        },
        "valid": True,
    }

    r = await client.get("/api/invites/not-a-real-token")
    assert r.status_code == 404
    assert r.json()["detail"] == "invite_not_found"

    await expire(db, invite)
    assert (await client.get(f"/api/invites/{invite['token']}")).json()["valid"] is False

    other = await create_invite(owner, owner.workspace_id)
    assert (await owner.client.delete(f"/api/invites/{other['id']}")).status_code == 204
    assert (await client.get(f"/api/invites/{other['token']}")).json()["valid"] is False


async def test_accept_invite(make_user: MakeUser, client):
    owner = await make_user()
    newcomer = await make_user()
    invite = await create_invite(owner, owner.workspace_id, "editor")

    assert (await client.post(f"/api/invites/{invite['token']}/accept")).status_code == 401

    r = await newcomer.client.post(f"/api/invites/{invite['token']}/accept")
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["id"], body["role"], body["memberCount"]) == (owner.workspace_id, "editor", 2)
    workspaces = {w["id"]: w["role"] for w in (await newcomer.client.get("/api/workspaces")).json()}
    assert workspaces == {newcomer.workspace_id: "owner", owner.workspace_id: "editor"}

    r = await newcomer.client.post(f"/api/invites/{invite['token']}/accept")
    assert r.status_code == 200
    assert r.json()["memberCount"] == 2


async def test_accept_keeps_the_higher_role(make_user: MakeUser):
    owner = await make_user()
    admin = await make_user()
    viewer = await make_user()
    await add_member(owner.workspace_id, admin, "admin")
    await add_member(owner.workspace_id, viewer, "viewer")
    invite = await create_invite(owner, owner.workspace_id, "editor")

    r = await admin.client.post(f"/api/invites/{invite['token']}/accept")
    assert r.status_code == 200
    assert r.json()["role"] == "admin"
    r = await viewer.client.post(f"/api/invites/{invite['token']}/accept")
    assert r.status_code == 200
    assert r.json()["role"] == "editor"
    r = await owner.client.post(f"/api/invites/{invite['token']}/accept")
    assert r.json()["role"] == "owner"


async def test_accept_invalid_invite(make_user: MakeUser, db):
    owner = await make_user()
    newcomer = await make_user()
    revoked = await create_invite(owner, owner.workspace_id)
    expired = await create_invite(owner, owner.workspace_id)
    assert (await owner.client.delete(f"/api/invites/{revoked['id']}")).status_code == 204
    await expire(db, expired)

    for invite in (revoked, expired):
        r = await newcomer.client.post(f"/api/invites/{invite['token']}/accept")
        assert r.status_code == 410
        assert r.json()["detail"] == "invite_invalid"
    r = await newcomer.client.post("/api/invites/unknown-token/accept")
    assert r.status_code == 404
    assert r.json()["detail"] == "invite_not_found"
    assert len((await newcomer.client.get("/api/workspaces")).json()) == 1


async def test_revoke_invite(make_user: MakeUser, db):
    owner = await make_user()
    admin = await make_user()
    editor = await make_user()
    stranger = await make_user()
    await add_member(owner.workspace_id, admin, "admin")
    await add_member(owner.workspace_id, editor, "editor")
    invite = await create_invite(owner, owner.workspace_id)

    r = await editor.client.delete(f"/api/invites/{invite['id']}")
    assert r.status_code == 403
    r = await stranger.client.delete(f"/api/invites/{invite['id']}")
    assert r.status_code == 404
    assert r.json()["detail"] == "invite_not_found"
    r = await admin.client.delete(f"/api/invites/{uuid.uuid4()}")
    assert r.status_code == 404
    assert r.json()["detail"] == "invite_not_found"

    assert (await admin.client.delete(f"/api/invites/{invite['id']}")).status_code == 204
    revoked_at_query = select(WorkspaceInvite.revoked_at).where(WorkspaceInvite.id == uuid.UUID(invite["id"]))
    revoked_at = await db.scalar(revoked_at_query)
    assert revoked_at is not None
    assert (await owner.client.delete(f"/api/invites/{invite['id']}")).status_code == 204
    assert await db.scalar(revoked_at_query) == revoked_at
