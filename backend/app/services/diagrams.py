import hashlib
import re
import unicodedata
from urllib.parse import quote

from sqlalchemy import ColumnElement, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.models import Diagram, Project, Workspace
from app.schemas.tree import RecentDiagram
from app.services.tree import diagram_fields

MAX_NAME_LENGTH = 200
COPY_SUFFIX = " copy"

PREVIEW_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:"


async def recent_diagrams(
    db: AsyncSession, *criteria: ColumnElement[bool], limit: int
) -> list[RecentDiagram]:
    rows = await db.execute(
        select(Diagram, Project.name, Workspace.id, Workspace.name)
        .options(defer(Diagram.xml))
        .join(Project, Project.id == Diagram.project_id)
        .join(Workspace, Workspace.id == Project.workspace_id)
        .where(Diagram.deleted_at.is_(None), Project.deleted_at.is_(None), *criteria)
        .order_by(Diagram.content_updated_at.desc(), Diagram.id)
        .limit(limit)
    )
    return [
        RecentDiagram(
            **diagram_fields(diagram),
            project_name=project_name,
            workspace_id=workspace_id,
            workspace_name=workspace_name,
        )
        for diagram, project_name, workspace_id, workspace_name in rows
    ]


def copy_name(name: str) -> str:
    return name[: MAX_NAME_LENGTH - len(COPY_SUFFIX)] + COPY_SUFFIX


def content_disposition(name: str, extension: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    ascii_name = re.sub(r"[^A-Za-z0-9 ._()\-]+", "_", ascii_name).strip(" ._") or "diagram"
    utf8_name = quote(name + extension, safe="")
    return f"attachment; filename=\"{ascii_name}{extension}\"; filename*=UTF-8''{utf8_name}"


def etag_for(content: str) -> str:
    return '"' + hashlib.sha256(content.encode("utf-8")).hexdigest()[:32] + '"'


def etag_matches(if_none_match: str | None, etag: str) -> bool:
    if not if_none_match:
        return False
    for candidate in if_none_match.split(","):
        candidate = candidate.strip()
        if candidate == "*" or candidate.removeprefix("W/") == etag:
            return True
    return False
