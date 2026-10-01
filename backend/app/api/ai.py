import uuid

from fastapi import APIRouter, HTTPException, status

from app.ai.checks import run_checks
from app.ai.graph import build_graph
from app.bpmn.xmlsafe import InvalidXml
from app.deps import CurrentUser, Db
from app.permissions import load_diagram
from app.schemas.ai import CheckOut, FindingOut
from app.services.realtime import flush_diagram

router = APIRouter(tags=["ai"])


async def current_xml(db: Db, user: CurrentUser, diagram_id: uuid.UUID) -> str:
    diagram, _, _ = await load_diagram(db, user, diagram_id)
    await flush_diagram(diagram.id)
    await db.refresh(diagram, ["xml"])
    return diagram.xml


@router.get("/diagrams/{diagram_id}/check", response_model=CheckOut)
async def check(diagram_id: uuid.UUID, user: CurrentUser, db: Db) -> CheckOut:
    xml = await current_xml(db, user, diagram_id)
    try:
        graph = build_graph(xml)
    except InvalidXml as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="invalid_bpmn") from exc
    findings = run_checks(graph)
    return CheckOut(
        findings=[FindingOut(**vars(f)) for f in findings],
        element_count=sum(1 for n in graph.nodes.values() if n.is_flow_node),
        flow_count=len(graph.sequence()),
    )
