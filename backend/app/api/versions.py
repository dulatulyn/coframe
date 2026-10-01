import uuid

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.db import utcnow
from app.deps import CurrentUser, Db
from app.models import Access, DiagramVersion
from app.permissions import load_diagram, not_found
from app.realtime.rooms import CLOSE_RESET, rooms
from app.schemas.tree import DiagramVersionOut
from app.services.common import public_user, touch_project
from app.services.diagrams import content_disposition
from app.services.realtime import publish
from app.services.versions import record_version

router = APIRouter(tags=["versions"])

VERSIONS_LISTED = 200


def version_out(version: DiagramVersion) -> DiagramVersionOut:
    return DiagramVersionOut(
        id=version.id,
        created_at=version.created_at,
        source=version.source,
        author=public_user(version.author),
    )


async def _version(db: Db, diagram_id: uuid.UUID, version_id: uuid.UUID) -> DiagramVersion:
    version = await db.get(DiagramVersion, version_id)
    if version is None or version.diagram_id != diagram_id:
        raise not_found("version_not_found")
    await db.refresh(version, ["xml"])
    return version


@router.get("/diagrams/{diagram_id}/versions", response_model=list[DiagramVersionOut])
async def list_versions(diagram_id: uuid.UUID, user: CurrentUser, db: Db) -> list[DiagramVersionOut]:
    diagram, _, _ = await load_diagram(db, user, diagram_id)
    await rooms.flush(diagram.id, snapshot=True)
    versions = (
        await db.scalars(
            select(DiagramVersion)
            .where(DiagramVersion.diagram_id == diagram.id)
            .order_by(DiagramVersion.created_at.desc())
            .limit(VERSIONS_LISTED)
        )
    ).all()
    return [version_out(v) for v in versions]


@router.get("/diagrams/{diagram_id}/versions/{version_id}/xml", response_class=Response)
async def version_xml(diagram_id: uuid.UUID, version_id: uuid.UUID, user: CurrentUser, db: Db) -> Response:
    diagram, _, _ = await load_diagram(db, user, diagram_id)
    version = await _version(db, diagram.id, version_id)
    stamp = version.created_at.strftime("%Y-%m-%d %H-%M")
    return Response(
        content=version.xml,
        media_type="application/xml; charset=utf-8",
        headers={"Content-Disposition": content_disposition(f"{diagram.name} {stamp}", ".bpmn")},
    )


@router.post("/diagrams/{diagram_id}/versions/{version_id}/restore", response_model=DiagramVersionOut)
async def restore_version(
    diagram_id: uuid.UUID, version_id: uuid.UUID, user: CurrentUser, db: Db
) -> DiagramVersionOut:
    diagram, project, _ = await load_diagram(db, user, diagram_id, Access.edit)
    version = await _version(db, diagram.id, version_id)
    await rooms.flush(diagram.id, snapshot=True)
    await db.refresh(diagram)
    await record_version(db, diagram.id, diagram.xml, diagram.updated_by, "auto")
    now = utcnow()
    diagram.xml = version.xml
    diagram.ydoc_state = None
    diagram.generation += 1
    diagram.content_updated_at = now
    diagram.updated_at = now
    diagram.updated_by = user.id
    restored = await record_version(db, diagram.id, version.xml, user.id, "restore")
    touch_project(project, now)
    await db.commit()
    await rooms.close_diagram(diagram.id, CLOSE_RESET, "restored")
    await publish(project.id, "tree")
    if restored is None:
        raise not_found("version_not_found")
    await db.refresh(restored, ["author"])
    return version_out(restored)
