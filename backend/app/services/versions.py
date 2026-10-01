import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import utcnow
from app.models import DiagramVersion, User


async def record_version(
    db: AsyncSession, diagram_id: uuid.UUID, xml: str, author: uuid.UUID | None, source: str
) -> DiagramVersion | None:
    latest = await db.scalar(
        select(DiagramVersion.xml)
        .where(DiagramVersion.diagram_id == diagram_id)
        .order_by(DiagramVersion.created_at.desc())
        .limit(1)
    )
    if latest == xml and source == "auto":
        return None
    existing_author = (
        await db.scalar(select(User.id).where(User.id == author)) if author is not None else None
    )
    version = DiagramVersion(
        diagram_id=diagram_id, xml=xml, created_by=existing_author, source=source, created_at=utcnow()
    )
    db.add(version)
    await db.flush()
    stale = (
        select(DiagramVersion.id)
        .where(DiagramVersion.diagram_id == diagram_id)
        .order_by(DiagramVersion.created_at.desc())
        .offset(settings.versions_kept)
    )
    await db.execute(delete(DiagramVersion).where(DiagramVersion.id.in_(stale)))
    return version
