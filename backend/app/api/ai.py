import json
import logging
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.ai import budget, prompts
from app.ai.checks import Finding, run_checks
from app.ai.describe import describe
from app.ai.graph import Graph, build_graph
from app.ai.llm import AiFailed, AiUnavailable, Usage, provider
from app.ai.ops import InvalidOps, Op, validate_ops
from app.ai.results import AiReview, AiSuggestions
from app.ai.simulate import Outcome, evaluate
from app.bpmn.xmlsafe import InvalidXml
from app.db import SessionLocal
from app.deps import CurrentUser, Db
from app.permissions import load_diagram
from app.schemas.ai import (
    AiLimitOut,
    AiStatusOut,
    ChatIn,
    CheckOut,
    FindingOut,
    FixOut,
    ImprovementOut,
    IssueOut,
    OpOut,
    ReviewIn,
    ReviewOut,
    SuggestIn,
    SuggestionOut,
    SuggestOut,
)
from app.services.realtime import flush_diagram

router = APIRouter(tags=["ai"])
log = logging.getLogger(__name__)

MAX_DESCRIPTION_CHARS = 120_000
MAX_CHAT_MESSAGES = 12
MAX_MESSAGE_CHARS = 4000


async def current_xml(db: Db, user: CurrentUser, diagram_id: uuid.UUID) -> str:
    diagram, _, _ = await load_diagram(db, user, diagram_id)
    await flush_diagram(diagram.id)
    await db.refresh(diagram, ["xml"])
    return diagram.xml


async def analyse(db: Db, user: CurrentUser, diagram_id: uuid.UUID) -> tuple[Graph, list[Finding]]:
    xml = await current_xml(db, user, diagram_id)
    try:
        graph = build_graph(xml)
    except InvalidXml as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="invalid_bpmn") from exc
    return graph, run_checks(graph)


def model_text(graph: Graph, findings: list[Finding]) -> str:
    text = describe(graph, findings)
    if len(text) > MAX_DESCRIPTION_CHARS:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, detail="diagram_too_large_for_ai")
    return text


def ops_out(ops: list[Op]) -> list[OpOut]:
    return [OpOut(**op.model_dump()) for op in ops]


def checked(ops: list[Op], graph: Graph, findings: list[Finding]) -> tuple[list[Op], Outcome] | None:
    try:
        valid = validate_ops(ops, graph)
    except InvalidOps as exc:
        log.info("dropped an AI suggestion: %s", exc)
        return None
    outcome = evaluate(graph, findings, valid)
    if outcome.breaks_model:
        log.info("dropped an AI suggestion that breaks the model: %s", [f.rule for f in outcome.introduces])
        return None
    return valid, outcome


def findings_out(findings: list[Finding]) -> list[FindingOut]:
    return [FindingOut(**vars(f)) for f in findings]


@router.get("/diagrams/{diagram_id}/check", response_model=CheckOut)
async def check(diagram_id: uuid.UUID, user: CurrentUser, db: Db) -> CheckOut:
    graph, findings = await analyse(db, user, diagram_id)
    return CheckOut(
        findings=findings_out(findings),
        element_count=sum(1 for n in graph.nodes.values() if n.is_flow_node),
        flow_count=len(graph.sequence()),
    )


@router.get("/ai/status", response_model=AiStatusOut)
async def ai_status(user: CurrentUser, db: Db) -> AiStatusOut:
    reason = budget.availability(user)
    if reason is None and await budget.month_spend(db) >= budget.settings.ai_monthly_budget_usd:
        reason = "ai_budget_exhausted"
    limits = {
        kind: AiLimitOut(used=await budget.used_today(db, user, kind), limit=budget.daily_limit(kind))
        for kind in ("review", "chat", "suggest", "generate")
    }
    return AiStatusOut(available=reason is None, reason=reason, limits=limits)


async def _call_failed(db: Db, user: CurrentUser, kind: budget.Kind, exc: Exception) -> HTTPException:
    if isinstance(exc, AiFailed) and exc.usage is not None:
        await budget.record(db, user, kind, exc.usage)
    if isinstance(exc, AiUnavailable):
        return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="ai_not_configured")
    log.exception("AI request failed", exc_info=exc)
    return HTTPException(status.HTTP_502_BAD_GATEWAY, detail="ai_failed")


@router.post("/diagrams/{diagram_id}/ai/review", response_model=ReviewOut)
async def ai_review(diagram_id: uuid.UUID, body: ReviewIn, user: CurrentUser, db: Db) -> ReviewOut:
    await budget.ensure_allowed(db, user, "review")
    graph, findings = await analyse(db, user, diagram_id)
    prompt = f"Diagram:\n{model_text(graph, findings)}\n\nWrite the review in {body.language[:40]}."
    try:
        review, usage = await provider().generate_json("smart", prompts.REVIEW, prompt, AiReview)
    except Exception as exc:
        raise await _call_failed(db, user, "review", exc) from exc
    await budget.record(db, user, "review", usage)

    known = set(graph.nodes) | {f.id for f in graph.flows.values()} | set(graph.pools) | set(graph.lanes)
    issues = []
    for issue in review.issues:
        fix = checked(issue.fix.ops, graph, findings) if issue.fix else None
        issues.append(
            IssueOut(
                title=issue.title,
                severity=issue.severity,
                explanation=issue.explanation,
                elements=[e for e in issue.elements if e in known],
                fix=FixOut(
                    title=issue.fix.title,
                    ops=ops_out(fix[0]),
                    resolves=[f.message for f in fix[1].resolves],
                    side_effects=[f.message for f in fix[1].introduces],
                )
                if issue.fix and fix
                else None,
            )
        )
    improvements = [
        ImprovementOut(
            title=i.title,
            rationale=i.rationale,
            ops=ops_out(valid[0]),
            resolves=[f.message for f in valid[1].resolves],
            side_effects=[f.message for f in valid[1].introduces],
        )
        for i in review.improvements
        if (valid := checked(i.ops, graph, findings))
    ]
    return ReviewOut(
        summary=review.summary,
        verdict=review.verdict,
        issues=issues,
        improvements=improvements,
        findings=findings_out(findings),
    )


@router.post("/diagrams/{diagram_id}/ai/suggest", response_model=SuggestOut)
async def ai_suggest(diagram_id: uuid.UUID, body: SuggestIn, user: CurrentUser, db: Db) -> SuggestOut:
    await budget.ensure_allowed(db, user, "suggest")
    graph, findings = await analyse(db, user, diagram_id)
    selected = graph.nodes.get(body.element_id)
    if selected is None or not selected.is_flow_node:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="element_not_found")
    prompt = (
        f"Diagram:\n{model_text(graph, findings)}\n\n"
        f"Selected element: {selected.id} ({selected.kind}) {selected.label}.\n"
        f"Use {body.language[:40]} for new labels unless the diagram uses another language."
    )
    try:
        result, usage = await provider().generate_json("fast", prompts.SUGGEST, prompt, AiSuggestions)
    except Exception as exc:
        raise await _call_failed(db, user, "suggest", exc) from exc
    await budget.record(db, user, "suggest", usage)
    suggestions = [
        SuggestionOut(
            title=s.title, ops=ops_out(valid[0]), side_effects=[f.message for f in valid[1].introduces]
        )
        for s in result.suggestions[:3]
        if (valid := checked(s.ops, graph, findings))
    ]
    return SuggestOut(suggestions=suggestions)


@router.post("/diagrams/{diagram_id}/ai/chat")
async def ai_chat(diagram_id: uuid.UUID, body: ChatIn, user: CurrentUser, db: Db) -> StreamingResponse:
    await budget.ensure_allowed(db, user, "chat")
    messages = [m for m in body.messages if m.text.strip()][-MAX_CHAT_MESSAGES:]
    if not messages or messages[-1].role != "user":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="question_required")
    graph, findings = await analyse(db, user, diagram_id)
    context = f"The diagram as it is right now:\n{model_text(graph, findings)}"
    contents = [("user", context), ("assistant", "Understood. Ask me about this diagram.")]
    contents += [(m.role, m.text[:MAX_MESSAGE_CHARS]) for m in messages]
    try:
        model = provider()
    except AiUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="ai_not_configured") from exc
    user_id = user.id

    async def events() -> AsyncIterator[str]:
        usage: Usage | None = None
        try:
            async for part in model.stream_text("smart", prompts.CHAT, contents):
                if isinstance(part, Usage):
                    usage = part
                else:
                    yield f"data: {json.dumps({'delta': part})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception:
            log.exception("AI chat failed")
            yield f"data: {json.dumps({'error': 'ai_failed'})}\n\n"
        finally:
            if usage is not None:
                async with SessionLocal() as session:
                    owner = await session.get(type(user), user_id)
                    if owner is not None:
                        await budget.record(session, owner, "chat", usage)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
