import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import utcnow
from app.models import Jam, JamParticipant, Project, Role, Workspace, WorkspaceMember
from app.schemas.common import MemberUser
from app.schemas.workspaces import MemberOut, WorkspaceOut
from app.services.common import fetch_dict
from app.services.realtime import publish


async def workspaces_out(db: AsyncSession, rows: Sequence[tuple[Workspace, Role]]) -> list[WorkspaceOut]:
    if not rows:
        return []
    ids = [workspace.id for workspace, _ in rows]
    members = await fetch_dict(
        db,
        select(WorkspaceMember.workspace_id, func.count())
        .where(WorkspaceMember.workspace_id.in_(ids))
        .group_by(WorkspaceMember.workspace_id),
    )
    projects = await fetch_dict(
        db,
        select(Project.workspace_id, func.count())
        .where(Project.workspace_id.in_(ids), Project.deleted_at.is_(None))
        .group_by(Project.workspace_id),
    )
    return [
        WorkspaceOut(
            id=workspace.id,
            name=workspace.name,
            role=role,
            member_count=members.get(workspace.id, 0),
            project_count=projects.get(workspace.id, 0),
            created_at=workspace.created_at,
        )
        for workspace, role in rows
    ]


async def workspace_out(db: AsyncSession, workspace: Workspace, role: Role) -> WorkspaceOut:
    return (await workspaces_out(db, [(workspace, role)]))[0]


def member_out(member: WorkspaceMember) -> MemberOut:
    return MemberOut(
        user=MemberUser.model_validate(member.user), role=member.role, joined_at=member.created_at
    )


async def owner_count(db: AsyncSession, workspace_id: uuid.UUID) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(WorkspaceMember)
            .where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.role == Role.owner)
        )
        or 0
    )


async def live_project_ids(db: AsyncSession, workspace_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        await db.scalars(
            select(Project.id).where(Project.workspace_id == workspace_id, Project.deleted_at.is_(None))
        )
    )


async def publish_member_joined(db: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID) -> None:
    project_ids = set(
        await db.scalars(
            select(Jam.project_id)
            .join(JamParticipant, JamParticipant.jam_id == Jam.id)
            .join(Project, Project.id == Jam.project_id)
            .where(
                Project.workspace_id == workspace_id,
                Project.deleted_at.is_(None),
                JamParticipant.user_id == user_id,
                Jam.ended_at.is_(None),
                Jam.expires_at > utcnow(),
            )
        )
    )
    for project_id in project_ids:
        await publish(project_id, "jam")
