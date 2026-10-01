import uuid
from datetime import datetime

from app.models import Access, Role
from app.schemas.auth import Name
from app.schemas.common import Schema
from app.schemas.jams import JamSummary


class ProjectIn(Schema):
    name: Name


class ProjectPatchIn(Schema):
    name: Name | None = None
    workspace_id: uuid.UUID | None = None


class ProjectOut(Schema):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    created_at: datetime
    updated_at: datetime
    diagram_count: int
    preview_diagram_id: uuid.UUID | None
    access: Access
    role: Role | None
    active_jam: JamSummary | None
