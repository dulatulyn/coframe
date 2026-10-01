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


class GenNode(BaseModel):
    id: str = Field(description="Short unique id such as Task_check or Gateway_ok.")
    type: str = Field(description="BPMN type such as bpmn:StartEvent, bpmn:UserTask, bpmn:ExclusiveGateway.")
    name: str
    event: str | None = Field(default=None, description="Trigger for events: message, timer, error, ...")
    attach_to: str | None = Field(default=None, description="Activity id, only for bpmn:BoundaryEvent.")


class GenFlow(BaseModel):
    id: str
    source: str
    target: str
    name: str | None = Field(default=None, description="Label, e.g. the answer of a decision.")
    default: bool = False


class AiProcess(BaseModel):
    name: str = Field(description="Short name of the diagram.")
    nodes: list[GenNode]
    flows: list[GenFlow]
