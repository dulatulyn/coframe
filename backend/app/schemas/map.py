import uuid
from datetime import datetime
from typing import Literal

from app.schemas.common import Schema


class MapDiagram(Schema):
    id: uuid.UUID
    name: str
    preview_updated_at: datetime | None


class MapLink(Schema):
    source: uuid.UUID
    target: uuid.UUID
    label: str
    kind: Literal["call", "decision"]


class ProcessMapOut(Schema):
    diagrams: list[MapDiagram]
    links: list[MapLink]
