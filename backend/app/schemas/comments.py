import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.common import PublicUser, Schema


class CommentIn(Schema):
    body: str = Field(min_length=1, max_length=4000)
    element_id: str | None = Field(default=None, max_length=128)
    parent_id: uuid.UUID | None = None


class CommentPatchIn(Schema):
    body: str | None = Field(default=None, min_length=1, max_length=4000)
    resolved: bool | None = None


class CommentOut(Schema):
    id: uuid.UUID
    parent_id: uuid.UUID | None
    element_id: str | None
    author: PublicUser | None
    body: str
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    resolved_by: PublicUser | None
