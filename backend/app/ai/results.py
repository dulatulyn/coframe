from typing import Literal

from pydantic import BaseModel, Field

from app.ai.ops import Op


class AiFix(BaseModel):
    title: str = Field(description="What the fix does, as a short imperative.")
    ops: list[Op]


class AiIssue(BaseModel):
    title: str
    severity: Literal["error", "warning", "info"]
    explanation: str = Field(description="Why it matters and what depends on it.")
    elements: list[str] = Field(description="Ids of the involved elements.")
    fix: AiFix | None = None


class AiImprovement(BaseModel):
    title: str
    rationale: str
    ops: list[Op]


class AiReview(BaseModel):
    summary: str
    verdict: Literal["solid", "needs_work", "broken"]
    issues: list[AiIssue]
    improvements: list[AiImprovement]


class AiSuggestion(BaseModel):
    title: str
    ops: list[Op]


class AiSuggestions(BaseModel):
    suggestions: list[AiSuggestion]
