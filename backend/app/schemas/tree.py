import uuid
from datetime import datetime
from typing import Literal

from app.models import Access
from app.schemas.auth import Name
from app.schemas.common import PublicUser, Schema
from app.schemas.projects import ProjectOut


class FolderIn(Schema):
    name: Name
    parent_id: uuid.UUID | None = None


class FolderPatchIn(Schema):
    name: Name | None = None
    parent_id: uuid.UUID | None = None
    position: str | None = None


class FolderOut(Schema):
    id: uuid.UUID
    project_id: uuid.UUID
    parent_id: uuid.UUID | None
    name: str
    position: str
    created_at: datetime
    updated_at: datetime


class DiagramIn(Schema):
    name: Name | None = None
    folder_id: uuid.UUID | None = None
    xml: str | None = None


class DiagramPatchIn(Schema):
    name: Name | None = None
    folder_id: uuid.UUID | None = None
    position: str | None = None
    pinned: bool | None = None


class DiagramMeta(Schema):
    id: uuid.UUID
    project_id: uuid.UUID
    folder_id: uuid.UUID | None
    name: str
    position: str
    created_at: datetime
    updated_at: datetime
    content_updated_at: datetime
    preview_updated_at: datetime | None
    pinned_at: datetime | None
    updated_by: PublicUser | None


class DiagramOut(DiagramMeta):
    access: Access
    generation: int = 0


class DiagramVersionOut(Schema):
    id: uuid.UUID
    created_at: datetime
    source: str
    author: PublicUser | None


class RecentDiagram(DiagramMeta):
    project_name: str
    workspace_id: uuid.UUID
    workspace_name: str


class TreeOut(Schema):
    project: ProjectOut
    folders: list[FolderOut]
    diagrams: list[DiagramMeta]


class TrashItem(Schema):
    kind: Literal["folder", "diagram"]
    id: uuid.UUID
    name: str
    deleted_at: datetime
    item_count: int


class SearchOut(Schema):
    projects: list[ProjectOut]
    diagrams: list[RecentDiagram]
