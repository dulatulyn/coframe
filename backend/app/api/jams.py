import uuid
from datetime import timedelta

from fastapi import APIRouter, Request, Response, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.config import settings
from app.db import utcnow
from app.deps import CurrentUser, Db
from app.models import Jam, JamParticipant, Project, Role
from app.permissions import active_jam, forbidden, load_project, not_found, role_at_least
from app.ratelimit import client_ip, enforce, jam_code_limiter
from app.schemas.jams import JamIn, JamJoinOut, JamOut, JamPatchIn, JamPreview
from app.services.common import public_user
from app.services.jams import find_live_jam, generate_code, jam_guests, jam_out, participant_count
from app.services.realtime import disconnect, publish

router = APIRouter(tags=["jams"])


@router.get("/projects/{project_id}/jam", response_model=JamOut | None)
async def get_jam(project_id: uuid.UUID, user: CurrentUser, db: Db) -> JamOut | None:
    project, access = await load_project(db, user, project_id)
    if access.jam is None:
        return None
    return await jam_out(db, access.jam, project.workspace_id)


@router.post("/projects/{project_id}/jam", status_code=status.HTTP_201_CREATED, response_model=JamOut)
async def start_jam(
    project_id: uuid.UUID, response: Response, user: CurrentUser, db: Db, body: JamIn | None = None
) -> JamOut:
    project, access = await load_project(db, user, project_id)
    if not role_at_least(access.role, Role.editor):
        raise forbidden()
    await db.execute(select(Project.id).where(Project.id == project.id).with_for_update())
    jam = await active_jam(db, project.id)
    if jam is not None:
        response.status_code = status.HTTP_200_OK
        return await jam_out(db, jam, project.workspace_id)
    now = utcnow()
    jam = Jam(
        project_id=project.id,
        code=await generate_code(db),
        access=(body or JamIn()).access,
        host_id=user.id,
        host=user,
        created_at=now,
        expires_at=now + timedelta(hours=settings.jam_ttl_hours),
    )
    db.add(jam)
    await db.commit()
    await publish(project.id, "jam")
    return await jam_out(db, jam, project.workspace_id)


async def _running_jam_for_manager(db: Db, user: CurrentUser, project_id: uuid.UUID) -> tuple[Project, Jam]:
    project, access = await load_project(db, user, project_id)
    jam = access.jam
    if jam is None:
        raise not_found("jam_not_found")
    if jam.host_id != user.id and not role_at_least(access.role, Role.admin):
        raise forbidden()
    return project, jam


@router.patch("/projects/{project_id}/jam", response_model=JamOut)
async def update_jam(project_id: uuid.UUID, body: JamPatchIn, user: CurrentUser, db: Db) -> JamOut:
    project, jam = await _running_jam_for_manager(db, user, project_id)
    jam.access = body.access
    await db.commit()
    await publish(project.id, "jam")
    return await jam_out(db, jam, project.workspace_id)


@router.delete("/projects/{project_id}/jam", status_code=status.HTTP_204_NO_CONTENT)
async def end_jam(project_id: uuid.UUID, user: CurrentUser, db: Db) -> None:
    project, jam = await _running_jam_for_manager(db, user, project_id)
    jam.ended_at = utcnow()
    guests = await jam_guests(db, jam, project.workspace_id)
    await db.commit()
    await publish(project.id, "jam")
    await disconnect(project.id, guests)


@router.get("/jams/{code}", response_model=JamPreview)
async def preview_jam(code: str, request: Request, db: Db) -> JamPreview:
    enforce(jam_code_limiter, client_ip(request))
    found = await find_live_jam(db, code)
    if found is None:
        raise not_found("jam_not_found")
    jam, project = found
    return JamPreview(
        code=jam.code,
        project_name=project.name,
        host=public_user(jam.host),
        participant_count=await participant_count(db, jam.id),
        access=jam.access,
    )


@router.post("/jams/{code}/join", response_model=JamJoinOut)
async def join_jam(code: str, request: Request, user: CurrentUser, db: Db) -> JamJoinOut:
    enforce(jam_code_limiter, client_ip(request))
    found = await find_live_jam(db, code)
    if found is None:
        raise not_found("jam_not_found")
    jam, project = found
    await db.execute(
        insert(JamParticipant)
        .values(jam_id=jam.id, user_id=user.id, joined_at=utcnow())
        .on_conflict_do_nothing(index_elements=[JamParticipant.jam_id, JamParticipant.user_id])
    )
    await db.commit()
    await publish(project.id, "jam")
    return JamJoinOut(project_id=project.id, jam=await jam_out(db, jam, project.workspace_id))
