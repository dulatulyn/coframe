import secrets
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import utcnow
from app.models import Jam, JamParticipant, Project, WorkspaceMember
from app.schemas.common import PublicUser
from app.schemas.jams import JamOut, JamParticipantOut
from app.services.common import public_user

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6


def normalize_code(raw: str) -> str:
    return "".join(ch for ch in raw.upper() if ch in CODE_ALPHABET)


async def generate_code(db: AsyncSession) -> str:
    for _ in range(50):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        if await db.scalar(select(Jam.id).where(Jam.code == code)) is None:
            return code
    raise RuntimeError("could not allocate a free jam code")


async def find_live_jam(db: AsyncSession, raw_code: str) -> tuple[Jam, Project] | None:
    code = normalize_code(raw_code)
    if len(code) != CODE_LENGTH:
        return None
    jam = await db.scalar(select(Jam).where(Jam.code == code))
    if jam is None or jam.ended_at is not None or jam.expires_at <= utcnow():
        return None
    project = await db.get(Project, jam.project_id)
    if project is None or project.deleted_at is not None:
        return None
    return jam, project


async def participant_count(db: AsyncSession, jam_id: uuid.UUID) -> int:
    return (
        await db.scalar(
            select(func.count()).select_from(JamParticipant).where(JamParticipant.jam_id == jam_id)
        )
        or 0
    )


async def _member_ids(db: AsyncSession, workspace_id: uuid.UUID, user_ids: set[uuid.UUID]) -> set[uuid.UUID]:
    if not user_ids:
        return set()
    return set(
        await db.scalars(
            select(WorkspaceMember.user_id).where(
                WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id.in_(user_ids)
            )
        )
    )


async def jam_out(db: AsyncSession, jam: Jam, workspace_id: uuid.UUID) -> JamOut:
    participants = (
        await db.scalars(
            select(JamParticipant)
            .where(JamParticipant.jam_id == jam.id)
            .order_by(JamParticipant.joined_at, JamParticipant.user_id)
        )
    ).all()
    members = await _member_ids(db, workspace_id, {p.user_id for p in participants})
    return JamOut(
        id=jam.id,
        project_id=jam.project_id,
        code=jam.code,
        access=jam.access,
        host=public_user(jam.host),
        created_at=jam.created_at,
        expires_at=jam.expires_at,
        participants=[
            JamParticipantOut(
                user=PublicUser.model_validate(p.user), joined_at=p.joined_at, is_member=p.user_id in members
            )
            for p in participants
        ],
    )


async def jam_guests(db: AsyncSession, jam: Jam, workspace_id: uuid.UUID) -> set[uuid.UUID]:
    users = set(await db.scalars(select(JamParticipant.user_id).where(JamParticipant.jam_id == jam.id)))
    if jam.host_id is not None:
        users.add(jam.host_id)
    return users - await _member_ids(db, workspace_id, users)
