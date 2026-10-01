import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class Schema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class PublicUser(Schema):
    id: uuid.UUID
    name: str
    color: str
    avatar_url: str | None = None


class UserOut(PublicUser):
    email: str | None
    created_at: datetime
    has_password: bool = True
    is_guest: bool = False


class MemberUser(PublicUser):
    email: str | None
