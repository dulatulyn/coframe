import uuid
from collections import defaultdict
from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Diagram, Folder, Project
from app.ordering import BASE_62_DIGITS, key_between, validate_order_key
from app.schemas.tree import DiagramMeta, TrashItem
from app.services.common import fetch_dict, public_user

MAX_POSITION_LENGTH = 64
_DIGITS = frozenset(BASE_62_DIGITS)


def valid_position(key: str) -> bool:
    if not key or len(key) > MAX_POSITION_LENGTH or not set(key) <= _DIGITS:
        return False
    try:
        validate_order_key(key)
    except ValueError:
        return False
    return True


async def next_folder_position(db: AsyncSession, project_id: uuid.UUID, parent_id: uuid.UUID | None) -> str:
    last = await db.scalar(
        select(func.max(Folder.position)).where(
            Folder.project_id == project_id,
            Folder.parent_id.is_(None) if parent_id is None else Folder.parent_id == parent_id,
        )
    )
    return key_between(last, None)


async def next_diagram_position(db: AsyncSession, project_id: uuid.UUID, folder_id: uuid.UUID | None) -> str:
    last = await db.scalar(
        select(func.max(Diagram.position)).where(
            Diagram.project_id == project_id,
            Diagram.folder_id.is_(None) if folder_id is None else Diagram.folder_id == folder_id,
        )
    )
    return key_between(last, None)


async def diagram_position_after(db: AsyncSession, diagram: Diagram) -> str:
    following = await db.scalar(
        select(func.min(Diagram.position)).where(
            Diagram.project_id == diagram.project_id,
            Diagram.folder_id.is_(None)
            if diagram.folder_id is None
            else Diagram.folder_id == diagram.folder_id,
            Diagram.deleted_at.is_(None),
            Diagram.position > diagram.position,
        )
    )
    return key_between(diagram.position, following)


async def _folder_position_taken(db: AsyncSession, folder: Folder) -> bool:
    return (
        await db.scalar(
            select(Folder.id)
            .where(
                Folder.project_id == folder.project_id,
                Folder.parent_id.is_(None)
                if folder.parent_id is None
                else Folder.parent_id == folder.parent_id,
                Folder.deleted_at.is_(None),
                Folder.id != folder.id,
                Folder.position == folder.position,
            )
            .limit(1)
        )
        is not None
    )


async def _diagram_position_taken(db: AsyncSession, diagram: Diagram) -> bool:
    return (
        await db.scalar(
            select(Diagram.id)
            .where(
                Diagram.project_id == diagram.project_id,
                Diagram.folder_id.is_(None)
                if diagram.folder_id is None
                else Diagram.folder_id == diagram.folder_id,
                Diagram.deleted_at.is_(None),
                Diagram.id != diagram.id,
                Diagram.position == diagram.position,
            )
            .limit(1)
        )
        is not None
    )


async def live_folder(db: AsyncSession, project_id: uuid.UUID, folder_id: uuid.UUID) -> Folder | None:
    folder = await db.get(Folder, folder_id)
    if folder is None or folder.project_id != project_id or folder.deleted_at is not None:
        return None
    return folder


async def _folder_parents(db: AsyncSession, project_id: uuid.UUID) -> dict[uuid.UUID, uuid.UUID | None]:
    return await fetch_dict(db, select(Folder.id, Folder.parent_id).where(Folder.project_id == project_id))


async def would_cycle(db: AsyncSession, folder: Folder, new_parent_id: uuid.UUID) -> bool:
    parents = await _folder_parents(db, folder.project_id)
    node: uuid.UUID | None = new_parent_id
    seen: set[uuid.UUID] = set()
    while node is not None and node not in seen:
        if node == folder.id:
            return True
        seen.add(node)
        node = parents.get(node)
    return False


def _descendants(parents: dict[uuid.UUID, uuid.UUID | None], root: uuid.UUID) -> set[uuid.UUID]:
    children: dict[uuid.UUID | None, list[uuid.UUID]] = defaultdict(list)
    for child, parent in parents.items():
        children[parent].append(child)
    found: set[uuid.UUID] = set()
    stack = [root]
    while stack:
        for child in children.get(stack.pop(), []):
            if child not in found and child != root:
                found.add(child)
                stack.append(child)
    return found


def is_top_level_trash(item: Folder | Diagram) -> bool:
    return item.deleted_at is not None and item.trashed_with is None


async def trash_folder(db: AsyncSession, folder: Folder, now: datetime) -> list[uuid.UUID]:
    below = _descendants(await _folder_parents(db, folder.project_id), folder.id)
    folder.deleted_at = now
    folder.trashed_with = None
    if below:
        await db.execute(
            update(Folder)
            .where(Folder.id.in_(below), Folder.deleted_at.is_(None))
            .values(deleted_at=now, trashed_with=folder.id)
        )
    diagram_ids = list(
        await db.scalars(
            select(Diagram.id).where(Diagram.folder_id.in_(below | {folder.id}), Diagram.deleted_at.is_(None))
        )
    )
    if diagram_ids:
        await db.execute(
            update(Diagram).where(Diagram.id.in_(diagram_ids)).values(deleted_at=now, trashed_with=folder.id)
        )
    return diagram_ids


async def restore_folder(db: AsyncSession, folder: Folder) -> None:
    moved = False
    if folder.parent_id is not None:
        parent = await db.get(Folder, folder.parent_id)
        if parent is None or parent.deleted_at is not None:
            folder.parent_id = None
            moved = True
    folder.deleted_at = None
    await db.execute(
        update(Folder).where(Folder.trashed_with == folder.id).values(deleted_at=None, trashed_with=None)
    )
    await db.execute(
        update(Diagram).where(Diagram.trashed_with == folder.id).values(deleted_at=None, trashed_with=None)
    )
    if moved or await _folder_position_taken(db, folder):
        folder.position = await next_folder_position(db, folder.project_id, folder.parent_id)


async def restore_diagram(db: AsyncSession, diagram: Diagram) -> None:
    moved = False
    if diagram.folder_id is not None:
        parent = await db.get(Folder, diagram.folder_id)
        if parent is None or parent.deleted_at is not None:
            diagram.folder_id = None
            moved = True
    diagram.deleted_at = None
    if moved or await _diagram_position_taken(db, diagram):
        diagram.position = await next_diagram_position(db, diagram.project_id, diagram.folder_id)


async def purge_folder(db: AsyncSession, folder: Folder) -> list[uuid.UUID]:
    folder_ids = [folder.id, *await db.scalars(select(Folder.id).where(Folder.trashed_with == folder.id))]
    diagram_ids = list(await db.scalars(select(Diagram.id).where(Diagram.trashed_with == folder.id)))
    if diagram_ids:
        await db.execute(delete(Diagram).where(Diagram.id.in_(diagram_ids)))
    await db.execute(delete(Folder).where(Folder.id.in_(folder_ids)))
    return diagram_ids


async def empty_trash(db: AsyncSession, project: Project) -> list[uuid.UUID]:
    diagram_ids = list(
        await db.scalars(
            select(Diagram.id).where(Diagram.project_id == project.id, Diagram.deleted_at.is_not(None))
        )
    )
    if diagram_ids:
        await db.execute(delete(Diagram).where(Diagram.id.in_(diagram_ids)))
    await db.execute(delete(Folder).where(Folder.project_id == project.id, Folder.deleted_at.is_not(None)))
    return diagram_ids


async def trash_items(db: AsyncSession, project: Project) -> list[TrashItem]:
    top_level = (
        Folder.project_id == project.id,
        Folder.deleted_at.is_not(None),
        Folder.trashed_with.is_(None),
    )
    folders = (await db.execute(select(Folder.id, Folder.name, Folder.deleted_at).where(*top_level))).all()
    diagrams = (
        await db.execute(
            select(Diagram.id, Diagram.name, Diagram.deleted_at).where(
                Diagram.project_id == project.id,
                Diagram.deleted_at.is_not(None),
                Diagram.trashed_with.is_(None),
            )
        )
    ).all()
    counts: dict[uuid.UUID, int] = defaultdict(int)
    if folders:
        folder_ids = [row.id for row in folders]
        for model in (Folder, Diagram):
            per_folder = await fetch_dict(
                db,
                select(model.trashed_with, func.count())
                .where(model.trashed_with.in_(folder_ids))
                .group_by(model.trashed_with),
            )
            for folder_id, count in per_folder.items():
                counts[folder_id] += count
    items = [
        TrashItem(
            kind="folder", id=row.id, name=row.name, deleted_at=row.deleted_at, item_count=counts[row.id]
        )
        for row in folders
    ] + [
        TrashItem(kind="diagram", id=row.id, name=row.name, deleted_at=row.deleted_at, item_count=0)
        for row in diagrams
    ]
    items.sort(key=lambda item: item.deleted_at, reverse=True)
    return items


def diagram_fields(diagram: Diagram) -> dict:
    return {
        "id": diagram.id,
        "project_id": diagram.project_id,
        "folder_id": diagram.folder_id,
        "name": diagram.name,
        "position": diagram.position,
        "created_at": diagram.created_at,
        "updated_at": diagram.updated_at,
        "content_updated_at": diagram.content_updated_at,
        "preview_updated_at": diagram.preview_updated_at,
        "pinned_at": diagram.pinned_at,
        "updated_by": public_user(diagram.updater),
        "kind": diagram.kind,
        "owner_id": diagram.owner_id,
    }


def diagram_meta(diagram: Diagram) -> DiagramMeta:
    return DiagramMeta(**diagram_fields(diagram))
