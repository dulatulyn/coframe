import io
import re
import uuid
import zipfile

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Diagram, Folder, Project
from app.services.realtime import flush_diagram

_UNSAFE = re.compile(r'[\\/:*?"<>|\x00-\x1f]+')


def safe_segment(name: str, fallback: str) -> str:
    cleaned = _UNSAFE.sub(" ", name).strip(" .")
    return cleaned[:150] or fallback


def _unique(name: str, extension: str, taken: set[str]) -> str:
    candidate, n = f"{name}{extension}", 2
    while candidate.lower() in taken:
        candidate, n = f"{name} ({n}){extension}", n + 1
    taken.add(candidate.lower())
    return candidate


async def project_zip(db: AsyncSession, project: Project) -> bytes:
    """Every live diagram and decision of the project as .bpmn/.dmn files, laid out by folder."""
    folders = list(
        await db.scalars(
            select(Folder)
            .where(Folder.project_id == project.id, Folder.deleted_at.is_(None))
            .order_by(Folder.position, Folder.created_at, Folder.id)
        )
    )
    diagram_ids = list(
        await db.scalars(
            select(Diagram.id).where(Diagram.project_id == project.id, Diagram.deleted_at.is_(None))
        )
    )
    for diagram_id in diagram_ids:
        await flush_diagram(diagram_id)
    diagrams = list(
        await db.scalars(
            select(Diagram)
            .where(Diagram.project_id == project.id, Diagram.deleted_at.is_(None))
            .order_by(Diagram.position, Diagram.created_at, Diagram.id)
            .execution_options(populate_existing=True)
        )
    )

    by_id = {folder.id: folder for folder in folders}
    taken: dict[uuid.UUID | None, set[str]] = {None: set()}
    paths: dict[uuid.UUID | None, str] = {None: ""}

    def folder_path(folder_id: uuid.UUID | None, seen: frozenset = frozenset()) -> str:
        if folder_id not in by_id or folder_id in seen:
            return ""
        if folder_id in paths:
            return paths[folder_id]
        folder = by_id[folder_id]
        parent = folder.parent_id if folder.parent_id in by_id else None
        prefix = folder_path(parent, seen | {folder_id})
        name = _unique(safe_segment(folder.name, "Folder"), "", taken.setdefault(parent, set()))
        paths[folder_id] = f"{prefix}{name}/"
        taken.setdefault(folder_id, set())
        return paths[folder_id]

    for folder in folders:
        folder_path(folder.id)

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for folder in folders:
            archive.writestr(paths[folder.id], b"")
        for diagram in diagrams:
            folder_id = diagram.folder_id if diagram.folder_id in by_id else None
            fallback = "Decision" if diagram.kind == "dmn" else "Diagram"
            name = _unique(safe_segment(diagram.name, fallback), f".{diagram.kind}", taken[folder_id])
            archive.writestr(paths[folder_id] + name, diagram.xml)
    return buffer.getvalue()
