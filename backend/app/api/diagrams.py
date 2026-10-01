import uuid

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select

from app.bpmn.svg import sanitize_svg
from app.bpmn.xmlsafe import InvalidXml, parse_bpmn
from app.config import settings
from app.db import utcnow
from app.deps import CurrentUser, Db
from app.models import Access, Diagram
from app.permissions import load_diagram, load_project, not_found
from app.schemas.tree import DiagramIn, DiagramMeta, DiagramOut, DiagramPatchIn
from app.services.common import read_body_limited, touch_project
from app.services.diagrams import PREVIEW_CSP, content_disposition, copy_name, etag_for, etag_matches
from app.services.projects import DEFAULT_DIAGRAM_NAME, create_diagram
from app.services.realtime import close_deleted_diagrams, flush_diagram, publish
from app.services.tree import (
    diagram_fields,
    diagram_meta,
    diagram_position_after,
    is_top_level_trash,
    live_folder,
    next_diagram_position,
    restore_diagram,
    valid_position,
)

router = APIRouter(tags=["diagrams"])


def bad_request(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail=detail)


@router.post(
    "/projects/{project_id}/diagrams", status_code=status.HTTP_201_CREATED, response_model=DiagramMeta
)
async def create(
    project_id: uuid.UUID, user: CurrentUser, db: Db, body: DiagramIn | None = None
) -> DiagramMeta:
    body = body or DiagramIn()
    project, _ = await load_project(db, user, project_id, Access.edit)
    if body.folder_id is not None and await live_folder(db, project.id, body.folder_id) is None:
        raise not_found("folder_not_found")
    if body.xml is not None:
        if len(body.xml.encode("utf-8")) > settings.max_xml_bytes:
            raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, detail="xml_too_large")
        try:
            parse_bpmn(body.xml)
        except InvalidXml as exc:
            raise bad_request("invalid_bpmn") from exc
    diagram = await create_diagram(
        db, project, user, name=body.name or DEFAULT_DIAGRAM_NAME, folder_id=body.folder_id, xml=body.xml
    )
    await db.commit()
    await publish(project.id, "tree")
    return diagram_meta(diagram)


@router.get("/diagrams/{diagram_id}", response_model=DiagramOut)
async def get_diagram(diagram_id: uuid.UUID, user: CurrentUser, db: Db) -> DiagramOut:
    diagram, _, access = await load_diagram(db, user, diagram_id)
    return DiagramOut(**diagram_fields(diagram), access=access.access, generation=diagram.generation)


@router.patch("/diagrams/{diagram_id}", response_model=DiagramMeta)
async def update_diagram(
    diagram_id: uuid.UUID, body: DiagramPatchIn, user: CurrentUser, db: Db
) -> DiagramMeta:
    diagram, project, _ = await load_diagram(db, user, diagram_id, Access.edit)
    if body.position is not None and not valid_position(body.position):
        raise bad_request("invalid_position")
    moving = "folder_id" in body.model_fields_set and body.folder_id != diagram.folder_id
    if moving and body.folder_id is not None and await live_folder(db, project.id, body.folder_id) is None:
        raise not_found("folder_not_found")
    pinning = body.pinned is not None and body.pinned != (diagram.pinned_at is not None)
    if body.name is None and not moving and body.position is None and not pinning:
        return diagram_meta(diagram)

    now = utcnow()
    if body.name is not None:
        diagram.name = body.name
    if pinning:
        diagram.pinned_at = now if body.pinned else None
    if moving:
        diagram.folder_id = body.folder_id
        if body.position is None:
            diagram.position = await next_diagram_position(db, project.id, body.folder_id)
    if body.position is not None:
        diagram.position = body.position
    diagram.updated_at = now
    touch_project(project, now)
    await db.commit()
    await publish(project.id, "tree")
    return diagram_meta(diagram)


@router.delete("/diagrams/{diagram_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_diagram(diagram_id: uuid.UUID, user: CurrentUser, db: Db, permanent: bool = False) -> None:
    diagram, project, _ = await load_diagram(db, user, diagram_id, Access.edit, include_deleted=permanent)
    now = utcnow()
    if permanent:
        if not is_top_level_trash(diagram):
            raise bad_request("not_in_trash")
        await db.delete(diagram)
    else:
        diagram.deleted_at = now
        diagram.trashed_with = None
    touch_project(project, now)
    await db.commit()
    await close_deleted_diagrams([diagram_id])
    await publish(project.id, "tree")


@router.post("/diagrams/{diagram_id}/restore", response_model=DiagramMeta)
async def restore(diagram_id: uuid.UUID, user: CurrentUser, db: Db) -> DiagramMeta:
    diagram, project, _ = await load_diagram(db, user, diagram_id, Access.edit, include_deleted=True)
    if not is_top_level_trash(diagram):
        raise bad_request("not_in_trash")
    await restore_diagram(db, diagram)
    touch_project(project)
    await db.commit()
    await publish(project.id, "tree")
    return diagram_meta(diagram)


@router.post("/diagrams/{diagram_id}/duplicate", response_model=DiagramMeta)
async def duplicate(diagram_id: uuid.UUID, user: CurrentUser, db: Db) -> DiagramMeta:
    diagram, project, _ = await load_diagram(db, user, diagram_id, Access.edit)
    await flush_diagram(diagram.id)
    await db.refresh(diagram)
    if diagram.deleted_at is not None:
        raise not_found("diagram_not_found")
    preview_svg = await db.scalar(select(Diagram.preview_svg).where(Diagram.id == diagram.id))
    now = utcnow()
    copy = Diagram(
        project_id=project.id,
        folder_id=diagram.folder_id,
        name=copy_name(diagram.name),
        position=await diagram_position_after(db, diagram),
        xml=diagram.xml,
        preview_svg=preview_svg,
        preview_updated_at=diagram.preview_updated_at if preview_svg is not None else None,
        created_by=user.id,
        updated_by=user.id,
        updater=user,
        created_at=now,
        updated_at=now,
        content_updated_at=now,
    )
    db.add(copy)
    touch_project(project, now)
    await db.commit()
    await publish(project.id, "tree")
    return diagram_meta(copy)


@router.get("/diagrams/{diagram_id}/xml", response_class=Response)
async def download_xml(diagram_id: uuid.UUID, user: CurrentUser, db: Db) -> Response:
    diagram, _, _ = await load_diagram(db, user, diagram_id)
    await flush_diagram(diagram.id)
    await db.refresh(diagram)
    return Response(
        content=diagram.xml,
        media_type="application/xml; charset=utf-8",
        headers={"Content-Disposition": content_disposition(diagram.name, ".bpmn")},
    )


@router.put("/diagrams/{diagram_id}/preview", status_code=status.HTTP_204_NO_CONTENT)
async def put_preview(diagram_id: uuid.UUID, request: Request, user: CurrentUser, db: Db) -> Response:
    diagram, _, _ = await load_diagram(db, user, diagram_id, Access.edit)
    data = await read_body_limited(request, settings.max_svg_bytes, "svg_too_large")
    try:
        svg = sanitize_svg(data)
    except InvalidXml as exc:
        raise bad_request("invalid_svg") from exc
    diagram.preview_svg = svg
    diagram.preview_updated_at = utcnow()
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/diagrams/{diagram_id}/preview", response_class=Response)
async def get_preview(diagram_id: uuid.UUID, request: Request, user: CurrentUser, db: Db) -> Response:
    diagram, _, _ = await load_diagram(db, user, diagram_id)
    svg = await db.scalar(select(Diagram.preview_svg).where(Diagram.id == diagram.id))
    if svg is None:
        raise not_found("preview_not_found")
    etag = etag_for(svg)
    headers = {
        "ETag": etag,
        "Cache-Control": "private, no-cache",
        "Content-Security-Policy": PREVIEW_CSP,
        "X-Content-Type-Options": "nosniff",
    }
    if etag_matches(request.headers.get("if-none-match"), etag):
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)
    return Response(content=svg, media_type="image/svg+xml", headers=headers)
