import logging
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.ai import budget, prompts
from app.ai.checks import Finding, run_checks
from app.ai.decisions import LinkedTable, decision_findings, decisions_text
from app.ai.describe import describe
from app.ai.generate import InvalidProcess, outline, process_xml
from app.ai.graph import Graph, build_graph
from app.ai.llm import AiFailed, AiUnavailable, provider
from app.ai.ops import InvalidOps, Op, validate_ops
from app.ai.results import AiCommand, AiProcess, AiReview, AiSuggestions
from app.ai.simulate import Outcome, evaluate
from app.bpmn.dmn import parse_decisions
from app.bpmn.xmlsafe import InvalidXml
from app.deps import CurrentUser, Db
from app.models import Access, Diagram
from app.permissions import load_diagram, load_project
from app.schemas.ai import (
    AiLimitOut,
    AiStatusOut,
    CheckOut,
    CommandIn,
    CommandOut,
    FindingOut,
    FixOut,
    GenerateIn,
    GenerateOut,
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
MAX_MESSAGE_CHARS = 60000


async def linked_tables(db: Db, project_id: uuid.UUID, graph: Graph) -> dict[str, LinkedTable]:
    ids = set()
    for node in graph.nodes.values():
        if node.kind == "businessRuleTask" and node.decision:
            try:
                ids.add(uuid.UUID(node.decision))
            except ValueError:
                continue
    if not ids:
        return {}
    rows = (
        await db.scalars(
            select(Diagram).where(
                Diagram.id.in_(ids),
                Diagram.project_id == project_id,
                Diagram.kind == "dmn",
                Diagram.deleted_at.is_(None),
            )
        )
    ).all()
    return {str(d.id): LinkedTable(str(d.id), d.name, parse_decisions(d.xml)) for d in rows}


async def analyse(db: Db, user: CurrentUser, diagram_id: uuid.UUID) -> tuple[Graph, list[Finding]]:
    graph, findings, _ = await analyse_with_tables(db, user, diagram_id)
    return graph, findings


async def analyse_with_tables(
    db: Db, user: CurrentUser, diagram_id: uuid.UUID
) -> tuple[Graph, list[Finding], dict[str, LinkedTable]]:
    diagram, _, _ = await load_diagram(db, user, diagram_id)
    await flush_diagram(diagram.id)
    await db.refresh(diagram, ["xml"])
    try:
        graph = build_graph(diagram.xml)
    except InvalidXml as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="invalid_bpmn") from exc
    tables = await linked_tables(db, diagram.project_id, graph)
    return graph, run_checks(graph) + decision_findings(graph, tables), tables


def model_text(graph: Graph, findings: list[Finding], tables: dict[str, LinkedTable] | None = None) -> str:
    text = describe(graph, findings)
    linked = decisions_text(graph, tables or {})
    if linked:
        text += f"\n\nDecision tables linked to business rule tasks:\n{linked}"
    if len(text) > MAX_DESCRIPTION_CHARS:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, detail="diagram_too_large_for_ai")
    return text


def ops_out(ops: list[Op]) -> list[OpOut]:
    return [OpOut(**op.model_dump()) for op in ops]


def checked(ops: list[Any], graph: Graph, findings: list[Finding]) -> tuple[list[Op], Outcome] | None:
    outcome = check_ops(ops, graph, findings)
    if isinstance(outcome, str):
        log.info("dropped an AI suggestion: %s", outcome)
        return None
    return outcome


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
    graph, findings, tables = await analyse_with_tables(db, user, diagram_id)
    prompt = f"Diagram:\n{model_text(graph, findings, tables)}\n\nWrite the review in {body.language[:40]}."
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
    graph, findings, tables = await analyse_with_tables(db, user, diagram_id)
    selected = graph.nodes.get(body.element_id)
    if selected is None or not selected.is_flow_node:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="element_not_found")
    prompt = (
        f"Diagram:\n{model_text(graph, findings, tables)}\n\n"
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


def selection_text(graph: Graph, ids: list[str]) -> str:
    lines = []
    for element_id in dict.fromkeys(ids):
        if node := graph.nodes.get(element_id):
            lines.append(f"- {node.id} ({node.kind}) {node.label}")
        elif flow := graph.flows.get(element_id):
            lines.append(f"- {flow.id} ({flow.kind} flow) {flow.source} -> {flow.target}")
        elif element_id in graph.pools or element_id in graph.lanes:
            lines.append(f"- {element_id} (pool or lane)")
    return "\n".join(lines)


def check_ops(ops: list[Any], graph: Graph, findings: list[Finding]) -> tuple[list[Op], Outcome] | str:
    try:
        valid = validate_ops(ops, graph)
    except InvalidOps as exc:
        return str(exc)
    outcome = evaluate(graph, findings, valid)
    if outcome.breaks_model:
        return "the change breaks the model: " + "; ".join(f.message for f in outcome.introduces)
    return valid, outcome


def new_problems(outcome: Outcome) -> str | None:
    found = [f.message for f in outcome.introduces if f.severity != "info"]
    return "it introduces " + "; ".join(found) if found else None


@router.post("/diagrams/{diagram_id}/ai/command", response_model=CommandOut)
async def ai_command(diagram_id: uuid.UUID, body: CommandIn, user: CurrentUser, db: Db) -> CommandOut:
    await budget.ensure_allowed(db, user, "chat")
    messages = [m for m in body.messages if m.text.strip()][-MAX_CHAT_MESSAGES:]
    if not messages or messages[-1].role != "user":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="question_required")
    graph, findings, tables = await analyse_with_tables(db, user, diagram_id)
    selected = selection_text(graph, body.selection)
    earlier = "\n".join(f"{m.role}: {m.text[:MAX_MESSAGE_CHARS]}" for m in messages[:-1])
    prompt = (
        f"Diagram:\n{model_text(graph, findings, tables)}\n\n"
        + (f"Selected elements:\n{selected}\n\n" if selected else "Nothing is selected.\n\n")
        + (f"Conversation so far:\n{earlier}\n\n" if earlier else "")
        + f"Interface language: {body.language[:40]}.\n"
        + f"User: {messages[-1].text[:MAX_MESSAGE_CHARS]}"
    )
    model = provider()

    async def ask(text: str) -> AiCommand:
        try:
            result, usage = await model.generate_json(
                "smart", prompts.COMMAND, text, AiCommand, thinking="LOW"
            )
        except Exception as exc:
            raise await _call_failed(db, user, "chat", exc) from exc
        await budget.record(db, user, "chat", usage)
        return result

    result = await ask(prompt)
    if not result.ops:
        return CommandOut(reply=result.reply)
    outcome = check_ops(result.ops, graph, findings)
    issue = outcome if isinstance(outcome, str) else new_problems(outcome[1])
    if issue:
        log.info("AI command needs a correction: %s", issue)
        retry = await ask(
            f"{prompt}\n\nThe code checker found a problem with your previous answer: {issue}.\n"
            "Return a corrected answer that makes the requested change without this problem. "
            "Use only ids that exist in the diagram or refs you create."
        )
        if retry.ops:
            second = check_ops(retry.ops, graph, findings)
            if not isinstance(second, str) and (isinstance(outcome, str) or not new_problems(second[1])):
                result, outcome = retry, second
        elif isinstance(outcome, str):
            return CommandOut(reply=retry.reply)
    if isinstance(outcome, str):
        log.info("AI command dropped: %s", outcome)
        return CommandOut(reply=result.reply, title=result.title, rejected=True)
    valid, effects = outcome
    return CommandOut(
        reply=result.reply,
        title=result.title or "AI change",
        ops=ops_out(valid),
        resolves=[f.message for f in effects.resolves],
        side_effects=[f.message for f in effects.introduces],
    )


REPAIR_ROUNDS = 2


@router.post("/projects/{project_id}/ai/generate", response_model=GenerateOut)
async def ai_generate(project_id: uuid.UUID, body: GenerateIn, user: CurrentUser, db: Db) -> GenerateOut:
    await load_project(db, user, project_id, Access.edit)
    await budget.ensure_allowed(db, user, "generate")
    language = body.language[:40]
    model = provider()

    async def ask(system: str, prompt: str, kind: str) -> AiProcess:
        try:
            result, usage = await model.generate_json("smart", system, prompt, AiProcess)
        except Exception as exc:
            raise await _call_failed(db, user, "generate", exc) from exc
        await budget.record(db, user, kind, usage)
        return result

    process = await ask(
        prompts.GENERATE, f"Description:\n{body.description}\n\nRequested language: {language}.", "generate"
    )
    rounds = 0
    while True:
        try:
            xml = process_xml(process)
            findings = run_checks(build_graph(xml))
            problems = [f"{f.severity} {f.rule}: {f.message}" for f in findings if f.severity != "info"]
        except (InvalidProcess, InvalidXml) as exc:
            xml, findings, problems = None, [], [f"error: {exc}"]
        if not problems or rounds >= REPAIR_ROUNDS:
            break
        rounds += 1
        listed = "\n".join(f"- {p}" for p in problems)
        process = await ask(
            prompts.REPAIR,
            f"Process:\n{outline(process)}\n\nProblems:\n{listed}\n\nKeep the language of the labels.",
            "generate_fix",
        )
    if xml is None:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="ai_failed")
    return GenerateOut(
        name=process.name[:200] or "Generated process",
        xml=xml,
        findings=findings_out(findings),
        rounds=rounds,
    )
