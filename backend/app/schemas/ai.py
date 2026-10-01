from typing import Literal

from pydantic import Field

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


class OpOut(Schema):
    op: str
    ref: str | None = None
    type: str | None = None
    event: str | None = None
    name: str | None = None
    after: str | None = None
    attach_to: str | None = None
    source: str | None = None
    target: str | None = None
    element: str | None = None
    flow: str | None = None


class FixOut(Schema):
    title: str
    ops: list[OpOut]
    resolves: list[str] = []
    side_effects: list[str] = []


class IssueOut(Schema):
    title: str
    severity: Literal["error", "warning", "info"]
    explanation: str
    elements: list[str]
    fix: FixOut | None


class ImprovementOut(Schema):
    title: str
    rationale: str
    ops: list[OpOut]
    resolves: list[str] = []
    side_effects: list[str] = []


class ReviewOut(Schema):
    summary: str
    verdict: Literal["solid", "needs_work", "broken"]
    issues: list[IssueOut]
    improvements: list[ImprovementOut]
    findings: list[FindingOut]


class ReviewIn(Schema):
    language: str = "English"


class ChatMessage(Schema):
    role: Literal["user", "assistant"]
    text: str


class ChatIn(Schema):
    messages: list[ChatMessage]


class SuggestIn(Schema):
    element_id: str
    language: str = "English"


class SuggestionOut(Schema):
    title: str
    ops: list[OpOut]
    side_effects: list[str] = []


class SuggestOut(Schema):
    suggestions: list[SuggestionOut]


class AiLimitOut(Schema):
    used: int
    limit: int


class AiStatusOut(Schema):
    available: bool
    reason: str | None
    limits: dict[str, AiLimitOut]


class GenerateIn(Schema):
    description: str = Field(min_length=3, max_length=4000)
    language: str = "English"


class GenerateOut(Schema):
    name: str
    xml: str
    findings: list[FindingOut]
    rounds: int
