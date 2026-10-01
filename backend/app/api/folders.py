import uuid

from fastapi import APIRouter, HTTPException, status

from app.db import utcnow
from app.deps import CurrentUser, Db
from app.models import Access, Folder
from app.permissions import load_folder, load_project, not_found
from app.schemas.tree import FolderIn, FolderOut, FolderPatchIn
from app.services.common import touch_project
from app.services.realtime import close_deleted_diagrams, publish
from app.services.tree import (
    is_top_level_trash,
    live_folder,
    next_folder_position,
    purge_folder,
    restore_folder,
    trash_folder,
    valid_position,
    would_cycle,
)

router = APIRouter(tags=["folders"])


def bad_request(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail=detail)


@router.post("/projects/{project_id}/folders", status_code=status.HTTP_201_CREATED, response_model=FolderOut)
async def create_folder(project_id: uuid.UUID, body: FolderIn, user: CurrentUser, db: Db) -> FolderOut:
    project, _ = await load_project(db, user, project_id, Access.edit)
    if body.parent_id is not None and await live_folder(db, project.id, body.parent_id) is None:
        raise not_found("folder_not_found")
    now = utcnow()
    folder = Folder(
        project_id=project.id,
        parent_id=body.parent_id,
        name=body.name,
        position=await next_folder_position(db, project.id, body.parent_id),
        created_at=now,
        updated_at=now,
    )
    db.add(folder)
    touch_project(project, now)
    await db.commit()
    await publish(project.id, "tree")
    return FolderOut.model_validate(folder)


@router.patch("/folders/{folder_id}", response_model=FolderOut)
async def update_folder(folder_id: uuid.UUID, body: FolderPatchIn, user: CurrentUser, db: Db) -> FolderOut:
    folder, project, _ = await load_folder(db, user, folder_id, Access.edit)
    if folder.deleted_at is not None:
        raise not_found("folder_not_found")
    if body.position is not None and not valid_position(body.position):
        raise bad_request("invalid_position")
    moving = "parent_id" in body.model_fields_set and body.parent_id != folder.parent_id
    if moving and body.parent_id is not None:
        if await live_folder(db, project.id, body.parent_id) is None:
            raise not_found("folder_not_found")
        if await would_cycle(db, folder, body.parent_id):
            raise bad_request("folder_cycle")
    if body.name is None and not moving and body.position is None:
        return FolderOut.model_validate(folder)

    now = utcnow()
    if body.name is not None:
        folder.name = body.name
    if moving:
        folder.parent_id = body.parent_id
        if body.position is None:
            folder.position = await next_folder_position(db, project.id, body.parent_id)
    if body.position is not None:
        folder.position = body.position
    folder.updated_at = now
    touch_project(project, now)
    await db.commit()
    await publish(project.id, "tree")
    return FolderOut.model_validate(folder)


@router.delete("/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(folder_id: uuid.UUID, user: CurrentUser, db: Db, permanent: bool = False) -> None:
    folder, project, _ = await load_folder(db, user, folder_id, Access.edit)
    now = utcnow()
    if permanent:
        if not is_top_level_trash(folder):
            raise bad_request("not_in_trash")
        diagram_ids = await purge_folder(db, folder)
    else:
        if folder.deleted_at is not None:
            raise not_found("folder_not_found")
        diagram_ids = await trash_folder(db, folder, now)
    touch_project(project, now)
    await db.commit()
    await close_deleted_diagrams(diagram_ids)
    await publish(project.id, "tree")


@router.post("/folders/{folder_id}/restore", response_model=FolderOut)
async def restore(folder_id: uuid.UUID, user: CurrentUser, db: Db) -> FolderOut:
    folder, project, _ = await load_folder(db, user, folder_id, Access.edit)
    if not is_top_level_trash(folder):
        raise bad_request("not_in_trash")
    await restore_folder(db, folder)
    touch_project(project)
    await db.commit()
    await publish(project.id, "tree")
    return FolderOut.model_validate(folder)
