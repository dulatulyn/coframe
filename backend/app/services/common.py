from datetime import datetime
from typing import Any

from fastapi import HTTPException, Request, status
from sqlalchemy import Select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import utcnow
from app.models import Project, User
from app.schemas.common import PublicUser


def public_user(user: User | None) -> PublicUser | None:
    return PublicUser.model_validate(user) if user is not None else None


async def fetch_dict(db: AsyncSession, stmt: Select[Any]) -> dict[Any, Any]:
    return {key: value for key, value in (await db.execute(stmt)).all()}


def touch_project(project: Project, now: datetime | None = None) -> None:
    project.updated_at = now or utcnow()


async def read_body_limited(request: Request, limit: int, too_large: str) -> bytes:
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > limit:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, detail=too_large)
    body = bytearray()
    async for chunk in request.stream():
        body += chunk
        if len(body) > limit:
            raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, detail=too_large)
    return bytes(body)
