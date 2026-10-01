import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.config import settings
from app.db import utcnow
from app.deps import CurrentUser, Db
from app.models import Role, Workspace, WorkspaceInvite, WorkspaceMember
from app.permissions import (
    ROLE_RANK,
    forbidden,
    not_found,
    require_workspace_role,
    role_at_least,
    workspace_role,
)
from app.schemas.workspaces import InviteIn, InviteOut, InvitePreview, InviteWorkspace, WorkspaceOut
from app.security import new_token
from app.services.common import public_user
from app.services.workspaces import publish_member_joined, workspace_out

router = APIRouter(tags=["invites"])


def _invite_out(invite: WorkspaceInvite) -> InviteOut:
    return InviteOut(
        id=invite.id,
        token=invite.token,
        role=invite.role,
        created_at=invite.created_at,
        expires_at=invite.expires_at,
        created_by=public_user(invite.creator),
    )


def _is_valid(invite: WorkspaceInvite, now: datetime) -> bool:
    return invite.revoked_at is None and invite.expires_at > now


async def _by_token(db: Db, token: str) -> WorkspaceInvite:
    invite = await db.scalar(select(WorkspaceInvite).where(WorkspaceInvite.token == token))
    if invite is None:
        raise not_found("invite_not_found")
    return invite


@router.get("/workspaces/{workspace_id}/invites", response_model=list[InviteOut])
async def list_invites(workspace_id: uuid.UUID, user: CurrentUser, db: Db) -> list[InviteOut]:
    await require_workspace_role(db, user, workspace_id, Role.admin)
    invites = await db.scalars(
        select(WorkspaceInvite)
        .where(
            WorkspaceInvite.workspace_id == workspace_id,
            WorkspaceInvite.revoked_at.is_(None),
            WorkspaceInvite.expires_at > utcnow(),
        )
        .order_by(WorkspaceInvite.created_at.desc())
    )
    return [_invite_out(invite) for invite in invites]


@router.post(
    "/workspaces/{workspace_id}/invites", status_code=status.HTTP_201_CREATED, response_model=InviteOut
)
async def create_invite(
    workspace_id: uuid.UUID, user: CurrentUser, db: Db, body: InviteIn | None = None
) -> InviteOut:
    role = await require_workspace_role(db, user, workspace_id, Role.admin)
    body = body or InviteIn()
    if body.role == Role.owner and role != Role.owner:
        raise forbidden()
    now = utcnow()
    invite = WorkspaceInvite(
        workspace_id=workspace_id,
        token=new_token(24),
        role=body.role,
        created_by=user.id,
        creator=user,
        created_at=now,
        expires_at=now + timedelta(days=settings.invite_ttl_days),
    )
    db.add(invite)
    await db.commit()
    return _invite_out(invite)


@router.delete("/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invite(invite_id: uuid.UUID, user: CurrentUser, db: Db) -> None:
    invite = await db.get(WorkspaceInvite, invite_id)
    role = await workspace_role(db, user.id, invite.workspace_id) if invite is not None else None
    if invite is None or role is None:
        raise not_found("invite_not_found")
    if not role_at_least(role, Role.admin):
        raise forbidden()
    if invite.revoked_at is None:
        invite.revoked_at = utcnow()
        await db.commit()


@router.get("/invites/{token}", response_model=InvitePreview)
async def preview_invite(token: str, db: Db) -> InvitePreview:
    invite = await _by_token(db, token)
    workspace = await db.get(Workspace, invite.workspace_id)
    return InvitePreview(
        workspace=InviteWorkspace(id=workspace.id, name=workspace.name),
        role=invite.role,
        invited_by=public_user(invite.creator),
        valid=_is_valid(invite, utcnow()),
    )


@router.post("/invites/{token}/accept", response_model=WorkspaceOut)
async def accept_invite(token: str, user: CurrentUser, db: Db) -> WorkspaceOut:
    invite = await _by_token(db, token)
    if not _is_valid(invite, utcnow()):
        raise HTTPException(status.HTTP_410_GONE, detail="invite_invalid")
    member = await db.get(WorkspaceMember, (invite.workspace_id, user.id))
    joined = member is None
    if member is None:
        member = WorkspaceMember(workspace_id=invite.workspace_id, user_id=user.id, role=invite.role)
        db.add(member)
    elif ROLE_RANK[invite.role] > ROLE_RANK[member.role]:
        member.role = invite.role
    role = member.role
    await db.commit()
    if joined:
        await publish_member_joined(db, invite.workspace_id, user.id)
    workspace = await db.get(Workspace, invite.workspace_id)
    return await workspace_out(db, workspace, role)
