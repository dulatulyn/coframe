import uuid

from fastapi import APIRouter
from lxml import etree
from sqlalchemy import select

from app.bpmn.xmlsafe import InvalidXml, parse_xml
from app.deps import CurrentUser, Db
from app.models import Diagram
from app.permissions import load_project
from app.schemas.map import MapDiagram, MapLink, ProcessMapOut

router = APIRouter(tags=["map"])

COFRAME_NS = "https://coframe.run/schema/bpmn/1.0"
LINK_ATTR = f"{{{COFRAME_NS}}}diagram"


def links_in(xml: str) -> list[tuple[str, str, str]]:
    try:
        root = parse_xml(xml)
    except InvalidXml:
        return []
    found = []
    for element in root.iter():
        if not isinstance(element.tag, str):
            continue
        target = element.get(LINK_ATTR)
        if target:
            kind = "decision" if etree.QName(element).localname == "businessRuleTask" else "call"
            found.append((target, (element.get("name") or "").strip(), kind))
    return found


@router.get("/projects/{project_id}/map", response_model=ProcessMapOut)
async def process_map(project_id: uuid.UUID, user: CurrentUser, db: Db) -> ProcessMapOut:
    project, _ = await load_project(db, user, project_id)
    diagrams = (
        await db.scalars(
            select(Diagram)
            .where(Diagram.project_id == project.id, Diagram.deleted_at.is_(None))
            .order_by(Diagram.position)
        )
    ).all()
    ids = {str(d.id) for d in diagrams}
    links = [
        MapLink(source=d.id, target=uuid.UUID(target), label=label, kind=kind)
        for d in diagrams
        for target, label, kind in links_in(d.xml)
        if target in ids and target != str(d.id)
    ]
    return ProcessMapOut(
        diagrams=[
            MapDiagram(id=d.id, name=d.name, preview_updated_at=d.preview_updated_at) for d in diagrams
        ],
        links=links,
    )
