import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import StringConstraints
from sqlalchemy import func, select

from app.db import utcnow
from app.deps import CurrentUser, Db
from app.models import Diagram, Jam, JamParticipant, Project, Role, User, Workspace, WorkspaceMember
from app.permissions import forbidden, not_found, require_workspace_role, role_at_least, workspace_role
from app.schemas.projects import ProjectOut
from app.schemas.tree import SearchOut
from app.schemas.workspaces import MemberAddIn, MemberOut, MemberPatchIn, WorkspaceIn, WorkspaceOut
from app.services.diagrams import recent_diagrams
from app.services.projects import projects_out
from app.services.realtime import close_deleted_diagrams, disconnect, publish
from app.services.workspaces import (
    live_project_ids,
    member_out,
    owner_count,
    publish_member_joined,
    workspace_out,
    workspaces_out,
)

router = APIRouter(tags=["workspaces"])

SEARCH_LIMIT = 20
SearchQuery = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100), Query()]


@router.get("/workspaces", response_model=list[WorkspaceOut])
async def list_workspaces(user: CurrentUser, db: Db) -> list[WorkspaceOut]:
    rows = await db.execute(
        select(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id)
        .order_by(Workspace.created_at, Workspace.id)
    )
    return await workspaces_out(db, [(workspace, role) for workspace, role in rows])


@router.post("/workspaces", status_code=status.HTTP_201_CREATED, response_model=WorkspaceOut)
async def create_workspace(body: WorkspaceIn, user: CurrentUser, db: Db) -> WorkspaceOut:
    workspace = Workspace(name=body.name, created_by=user.id, created_at=utcnow())
    db.add(workspace)
    await db.flush()
    db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=Role.owner))
    await db.commit()
    return await workspace_out(db, workspace, Role.owner)


@router.get("/workspaces/{workspace_id}", response_model=WorkspaceOut)
async def get_workspace(workspace_id: uuid.UUID, user: CurrentUser, db: Db) -> WorkspaceOut:
    role = await require_workspace_role(db, user, workspace_id)
    workspace = await db.get(Workspace, workspace_id)
    return await workspace_out(db, workspace, role)


@router.patch("/workspaces/{workspace_id}", response_model=WorkspaceOut)
async def update_workspace(
    workspace_id: uuid.UUID, body: WorkspaceIn, user: CurrentUser, db: Db
) -> WorkspaceOut:
    role = await require_workspace_role(db, user, workspace_id, Role.admin)
    workspace = await db.get(Workspace, workspace_id)
    workspace.name = body.name
    await db.commit()
    return await workspace_out(db, workspace, role)


@router.delete("/workspaces/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(workspace_id: uuid.UUID, user: CurrentUser, db: Db) -> None:
    await require_workspace_role(db, user, workspace_id, Role.owner)
    other_workspaces = await db.scalar(
        select(func.count())
        .select_from(WorkspaceMember)
        .where(WorkspaceMember.user_id == user.id, WorkspaceMember.workspace_id != workspace_id)
    )
    if not other_workspaces:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="last_workspace")
    project_ids = await live_project_ids(db, workspace_id)
    diagram_ids = list(
        await db.scalars(
            select(Diagram.id)
            .join(Project, Project.id == Diagram.project_id)
            .where(Project.workspace_id == workspace_id)
        )
    )
    workspace = await db.get(Workspace, workspace_id)
    await db.delete(workspace)
    await db.commit()
    await close_deleted_diagrams(diagram_ids)
    for project_id in project_ids:
        await publish(project_id, "project")


@router.get("/workspaces/{workspace_id}/members", response_model=list[MemberOut])
async def list_members(workspace_id: uuid.UUID, user: CurrentUser, db: Db) -> list[MemberOut]:
    await require_workspace_role(db, user, workspace_id)
    members = await db.scalars(
        select(WorkspaceMember)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.created_at, WorkspaceMember.user_id)
    )
    return [member_out(member) for member in members]


@router.post(
    "/workspaces/{workspace_id}/members", status_code=status.HTTP_201_CREATED, response_model=MemberOut
)
async def add_member(workspace_id: uuid.UUID, body: MemberAddIn, user: CurrentUser, db: Db) -> MemberOut:
    role = await require_workspace_role(db, user, workspace_id, Role.admin)
    if body.role == Role.owner and role != Role.owner:
        raise forbidden()
    if await workspace_role(db, body.user_id, workspace_id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="already_member")
    participated = await db.scalar(
        select(JamParticipant.user_id)
        .join(Jam, Jam.id == JamParticipant.jam_id)
        .join(Project, Project.id == Jam.project_id)
        .where(Project.workspace_id == workspace_id, JamParticipant.user_id == body.user_id)
        .limit(1)
    )
    target = await db.get(User, body.user_id) if participated is not None else None
    if target is None:
        raise forbidden("not_jam_participant")
    member = WorkspaceMember(
        workspace_id=workspace_id, user_id=target.id, role=body.role, user=target, created_at=utcnow()
    )
    db.add(member)
    await db.commit()
    await publish_member_joined(db, workspace_id, target.id)
    return member_out(member)


@router.patch("/workspaces/{workspace_id}/members/{user_id}", response_model=MemberOut)
async def update_member(
    workspace_id: uuid.UUID, user_id: uuid.UUID, body: MemberPatchIn, user: CurrentUser, db: Db
) -> MemberOut:
    role = await require_workspace_role(db, user, workspace_id, Role.admin)
    member = await db.get(WorkspaceMember, (workspace_id, user_id))
    if member is None:
        raise not_found("member_not_found")
    if Role.owner in (member.role, body.role) and role != Role.owner:
        raise forbidden()
    if member.role == Role.owner and body.role != Role.owner and await owner_count(db, workspace_id) <= 1:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="last_owner")
    member.role = body.role
    await db.commit()
    return member_out(member)


@router.delete("/workspaces/{workspace_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(workspace_id: uuid.UUID, user_id: uuid.UUID, user: CurrentUser, db: Db) -> None:
    role = await require_workspace_role(db, user, workspace_id)
    leaving = user_id == user.id
    if not leaving and not role_at_least(role, Role.admin):
        raise forbidden()
    member = await db.get(WorkspaceMember, (workspace_id, user_id))
    if member is None:
        raise not_found("member_not_found")
    if not leaving and member.role == Role.owner and role != Role.owner:
        raise forbidden()
    if member.role == Role.owner and await owner_count(db, workspace_id) <= 1:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="last_owner")
    project_ids = await live_project_ids(db, workspace_id)
    await db.delete(member)
    await db.commit()
    for project_id in project_ids:
        await disconnect(project_id, {user_id})


def _like_pattern(query: str) -> str:
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@router.get("/workspaces/{workspace_id}/search", response_model=SearchOut)
async def search(workspace_id: uuid.UUID, q: SearchQuery, user: CurrentUser, db: Db) -> SearchOut:
    await require_workspace_role(db, user, workspace_id)
    pattern = _like_pattern(q)
    projects = await db.scalars(
        select(Project)
        .where(
            Project.workspace_id == workspace_id,
            Project.deleted_at.is_(None),
            Project.name.ilike(pattern, escape="\\"),
        )
        .order_by(Project.updated_at.desc(), Project.id)
        .limit(SEARCH_LIMIT)
    )
    project_models: list[ProjectOut] = await projects_out(db, user, projects.all())
    diagrams = await recent_diagrams(
        db,
        Project.workspace_id == workspace_id,
        Diagram.name.ilike(pattern, escape="\\"),
        limit=SEARCH_LIMIT,
    )
    return SearchOut(projects=project_models, diagrams=diagrams)
