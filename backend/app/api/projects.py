import uuid

from fastapi import APIRouter, status
from sqlalchemy import select
from sqlalchemy.orm import defer

from app.db import utcnow
from app.deps import CurrentUser, Db
from app.models import Access, Diagram, Folder, Project, Role
from app.permissions import forbidden, load_project, require_workspace_role, role_at_least
from app.schemas.projects import ProjectIn, ProjectOut, ProjectPatchIn
from app.schemas.tree import FolderOut, TrashItem, TreeOut
from app.services.common import touch_project
from app.services.projects import create_diagram, project_out, projects_out
from app.services.realtime import close_deleted_diagrams, disconnect, publish
from app.services.tree import diagram_meta, empty_trash, trash_items

router = APIRouter(tags=["projects"])


@router.get("/workspaces/{workspace_id}/projects", response_model=list[ProjectOut])
async def list_projects(workspace_id: uuid.UUID, user: CurrentUser, db: Db) -> list[ProjectOut]:
    await require_workspace_role(db, user, workspace_id)
    projects = await db.scalars(
        select(Project)
        .where(Project.workspace_id == workspace_id, Project.deleted_at.is_(None))
        .order_by(Project.updated_at.desc(), Project.id)
    )
    return await projects_out(db, user, projects.all())


@router.post(
    "/workspaces/{workspace_id}/projects", status_code=status.HTTP_201_CREATED, response_model=ProjectOut
)
async def create_project(workspace_id: uuid.UUID, body: ProjectIn, user: CurrentUser, db: Db) -> ProjectOut:
    await require_workspace_role(db, user, workspace_id, Role.editor)
    now = utcnow()
    project = Project(
        workspace_id=workspace_id, name=body.name, created_by=user.id, created_at=now, updated_at=now
    )
    db.add(project)
    await db.flush()
    await create_diagram(db, project, user)
    await db.commit()
    return await project_out(db, user, project)


@router.get("/projects/{project_id}", response_model=ProjectOut)
async def get_project(project_id: uuid.UUID, user: CurrentUser, db: Db) -> ProjectOut:
    project, access = await load_project(db, user, project_id)
    return await project_out(db, user, project, access)


@router.patch("/projects/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: uuid.UUID, body: ProjectPatchIn, user: CurrentUser, db: Db
) -> ProjectOut:
    project, access = await load_project(db, user, project_id, Access.edit)
    moving = body.workspace_id is not None and body.workspace_id != project.workspace_id
    if moving:
        if not role_at_least(access.role, Role.admin):
            raise forbidden()
        await require_workspace_role(db, user, body.workspace_id, Role.admin)
    if body.name is None and not moving:
        return await project_out(db, user, project, access)
    if body.name is not None:
        project.name = body.name
    if moving:
        project.workspace_id = body.workspace_id
    touch_project(project)
    await db.commit()
    await publish(project.id, "project")
    if moving:
        await disconnect(project.id, None)
        return await project_out(db, user, project)
    return await project_out(db, user, project, access)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: uuid.UUID, user: CurrentUser, db: Db) -> None:
    project, access = await load_project(db, user, project_id)
    if not role_at_least(access.role, Role.admin):
        raise forbidden()
    now = utcnow()
    project.deleted_at = now
    if access.jam is not None:
        access.jam.ended_at = now
    diagram_ids = list(await db.scalars(select(Diagram.id).where(Diagram.project_id == project.id)))
    await db.commit()
    await close_deleted_diagrams(diagram_ids)
    await publish(project.id, "project")


@router.get("/projects/{project_id}/tree", response_model=TreeOut)
async def get_tree(project_id: uuid.UUID, user: CurrentUser, db: Db) -> TreeOut:
    project, access = await load_project(db, user, project_id)
    folders = await db.scalars(
        select(Folder)
        .where(Folder.project_id == project.id, Folder.deleted_at.is_(None))
        .order_by(Folder.position, Folder.created_at, Folder.id)
    )
    diagrams = await db.scalars(
        select(Diagram)
        .options(defer(Diagram.xml))
        .where(Diagram.project_id == project.id, Diagram.deleted_at.is_(None))
        .order_by(Diagram.position, Diagram.created_at, Diagram.id)
    )
    return TreeOut(
        project=await project_out(db, user, project, access),
        folders=[FolderOut.model_validate(folder) for folder in folders],
        diagrams=[diagram_meta(diagram) for diagram in diagrams],
    )


@router.get("/projects/{project_id}/trash", response_model=list[TrashItem])
async def get_trash(project_id: uuid.UUID, user: CurrentUser, db: Db) -> list[TrashItem]:
    project, _ = await load_project(db, user, project_id)
    return await trash_items(db, project)


@router.delete("/projects/{project_id}/trash", status_code=status.HTTP_204_NO_CONTENT)
async def clear_trash(project_id: uuid.UUID, user: CurrentUser, db: Db) -> None:
    project, _ = await load_project(db, user, project_id, Access.edit)
    diagram_ids = await empty_trash(db, project)
    touch_project(project)
    await db.commit()
    await close_deleted_diagrams(diagram_ids)
    await publish(project.id, "tree")
