from typing import Literal

from app.schemas.common import Schema


class FindingOut(Schema):
    rule: str
    severity: Literal["error", "warning", "info"]
    message: str
    elements: list[str]


class CheckOut(Schema):
    findings: list[FindingOut]
    element_count: int
    flow_count: int
