import uuid
from datetime import datetime

from app.models import Access
from app.schemas.common import PublicUser, Schema


class JamIn(Schema):
    access: Access = Access.edit


class JamPatchIn(Schema):
    access: Access


class JamSummary(Schema):
    code: str
    access: Access
    host: PublicUser | None
    participant_count: int
    expires_at: datetime


class JamParticipantOut(Schema):
    user: PublicUser
    joined_at: datetime
    is_member: bool


class JamOut(Schema):
    id: uuid.UUID
    project_id: uuid.UUID
    code: str
    access: Access
    host: PublicUser | None
    created_at: datetime
    expires_at: datetime
    participants: list[JamParticipantOut]


class JamPreview(Schema):
    code: str
    project_name: str
    host: PublicUser | None
    participant_count: int
    access: Access


class JamJoinOut(Schema):
    project_id: uuid.UUID
    jam: JamOut
