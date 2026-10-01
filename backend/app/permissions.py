import uuid
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import utcnow
from app.models import (
    Access,
    Diagram,
    Folder,
    Jam,
    JamParticipant,
    Project,
    Role,
    User,
    WorkspaceMember,
)

ROLE_RANK: dict[Role, int] = {Role.viewer: 1, Role.editor: 2, Role.admin: 3, Role.owner: 4}


def role_at_least(role: Role | None, minimum: Role) -> bool:
    return role is not None and ROLE_RANK[role] >= ROLE_RANK[minimum]


def role_access(role: Role | None) -> Access | None:
    if role is None:
        return None
    return Access.edit if role_at_least(role, Role.editor) else Access.view


@dataclass(frozen=True)
class ProjectAccess:
    access: Access
    role: Role | None
    jam: Jam | None

    @property
    def can_edit(self) -> bool:
        return self.access == Access.edit

    @property
    def via_jam_only(self) -> bool:
        return self.role is None


def forbidden(detail: str = "forbidden") -> HTTPException:
    return HTTPException(status.HTTP_403_FORBIDDEN, detail=detail)


def not_found(detail: str = "not_found") -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, detail=detail)


async def workspace_role(db: AsyncSession, user_id: uuid.UUID, workspace_id: uuid.UUID) -> Role | None:
    return await db.scalar(
        select(WorkspaceMember.role).where(
            WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user_id
        )
    )


async def require_workspace_role(
    db: AsyncSession, user: User, workspace_id: uuid.UUID, minimum: Role = Role.viewer
) -> Role:
    role = await workspace_role(db, user.id, workspace_id)
    if role is None:
        raise not_found("workspace_not_found")
    if not role_at_least(role, minimum):
        raise forbidden()
    return role


async def active_jam(db: AsyncSession, project_id: uuid.UUID) -> Jam | None:
    return await db.scalar(
        select(Jam)
        .where(Jam.project_id == project_id, Jam.ended_at.is_(None), Jam.expires_at > utcnow())
        .order_by(Jam.created_at.desc())
        .limit(1)
    )


async def is_jam_participant(db: AsyncSession, jam_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    found = await db.scalar(
        select(JamParticipant.user_id).where(
            JamParticipant.jam_id == jam_id, JamParticipant.user_id == user_id
        )
    )
    return found is not None


async def project_access(db: AsyncSession, user: User, project: Project) -> ProjectAccess | None:
    role = await workspace_role(db, user.id, project.workspace_id)
    best = role_access(role)
    jam = await active_jam(db, project.id)
    in_jam = jam is not None and (jam.host_id == user.id or await is_jam_participant(db, jam.id, user.id))
    if in_jam and (best is None or (best == Access.view and jam.access == Access.edit)):
        best = jam.access
    if best is None:
        return None
    return ProjectAccess(access=best, role=role, jam=jam)


async def load_project(
    db: AsyncSession, user: User, project_id: uuid.UUID, need: Access = Access.view
) -> tuple[Project, ProjectAccess]:
    project = await db.get(Project, project_id)
    if project is None or project.deleted_at is not None:
        raise not_found("project_not_found")
    access = await project_access(db, user, project)
    if access is None:
        raise not_found("project_not_found")
    if need == Access.edit and not access.can_edit:
        raise forbidden()
    return project, access


async def load_folder(
    db: AsyncSession, user: User, folder_id: uuid.UUID, need: Access = Access.view
) -> tuple[Folder, Project, ProjectAccess]:
    folder = await db.get(Folder, folder_id)
    if folder is None:
        raise not_found("folder_not_found")
    project, access = await load_project(db, user, folder.project_id, need)
    return folder, project, access


async def load_diagram(
    db: AsyncSession,
    user: User,
    diagram_id: uuid.UUID,
    need: Access = Access.view,
    *,
    include_deleted: bool = False,
) -> tuple[Diagram, Project, ProjectAccess]:
    diagram = await db.get(Diagram, diagram_id)
    if diagram is None or (diagram.deleted_at is not None and not include_deleted):
        raise not_found("diagram_not_found")
    project, access = await load_project(db, user, diagram.project_id, need)
    return diagram, project, access
