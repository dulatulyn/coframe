import uuid
from datetime import datetime

from app.models import Role
from app.schemas.auth import Name
from app.schemas.common import MemberUser, PublicUser, Schema


class WorkspaceIn(Schema):
    name: Name


class WorkspaceOut(Schema):
    id: uuid.UUID
    name: str
    role: Role
    member_count: int
    project_count: int
    created_at: datetime


class MemberOut(Schema):
    user: MemberUser
    role: Role
    joined_at: datetime


class MemberAddIn(Schema):
    user_id: uuid.UUID
    role: Role = Role.editor


class MemberPatchIn(Schema):
    role: Role


class InviteIn(Schema):
    role: Role = Role.editor


class InviteOut(Schema):
    id: uuid.UUID
    token: str
    role: Role
    created_at: datetime
    expires_at: datetime
    created_by: PublicUser | None


class InviteWorkspace(Schema):
    id: uuid.UUID
    name: str


class InvitePreview(Schema):
    workspace: InviteWorkspace
    role: Role
    invited_by: PublicUser | None
    valid: bool
