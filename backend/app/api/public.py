import re
import secrets
import uuid

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.db import utcnow
from app.deps import CurrentUser, Db
from app.models import Access, Diagram, Project
from app.permissions import load_diagram, not_found
from app.schemas.tree import PublicDecisionOut, PublicDiagramOut, PublicLinkOut
from app.services.realtime import flush_diagram

router = APIRouter(tags=["public"])

LINK = re.compile(r'coframe:diagram="([0-9a-fA-F-]{36})"')


@router.put("/diagrams/{diagram_id}/public-link", response_model=PublicLinkOut)
async def enable_public_link(diagram_id: uuid.UUID, user: CurrentUser, db: Db) -> PublicLinkOut:
    diagram, _, _ = await load_diagram(db, user, diagram_id, Access.edit)
    if diagram.kind != "bpmn":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="not_shareable")
    if diagram.public_token is None:
        diagram.public_token = secrets.token_urlsafe(18)
        diagram.updated_at = utcnow()
        await db.commit()
    return PublicLinkOut(token=diagram.public_token)


@router.delete("/diagrams/{diagram_id}/public-link", status_code=status.HTTP_204_NO_CONTENT)
async def disable_public_link(diagram_id: uuid.UUID, user: CurrentUser, db: Db) -> Response:
    diagram, _, _ = await load_diagram(db, user, diagram_id, Access.edit)
    if diagram.public_token is not None:
        diagram.public_token = None
        diagram.updated_at = utcnow()
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/public/{token}", response_model=PublicDiagramOut)
async def public_diagram(token: str, db: Db) -> PublicDiagramOut:
    if not 8 <= len(token) <= 32:
        raise not_found("diagram_not_found")
    row = (
        await db.execute(
            select(Diagram, Project.name)
            .join(Project, Project.id == Diagram.project_id)
            .where(Diagram.public_token == token, Diagram.deleted_at.is_(None), Project.deleted_at.is_(None))
        )
    ).first()
    if row is None:
        raise not_found("diagram_not_found")
    diagram, project_name = row
    await flush_diagram(diagram.id)
    await db.refresh(diagram, ["xml", "content_updated_at", "name"])
    linked = set()
    for value in LINK.findall(diagram.xml):
        try:
            linked.add(uuid.UUID(value))
        except ValueError:
            continue
    decisions = []
    if linked:
        tables = await db.scalars(
            select(Diagram).where(
                Diagram.id.in_(linked),
                Diagram.project_id == diagram.project_id,
                Diagram.kind == "dmn",
                Diagram.deleted_at.is_(None),
            )
        )
        decisions = [PublicDecisionOut(id=t.id, name=t.name, xml=t.xml) for t in tables]
    return PublicDiagramOut(
        name=diagram.name,
        xml=diagram.xml,
        project_name=project_name,
        content_updated_at=diagram.content_updated_at,
        decisions=decisions,
    )
