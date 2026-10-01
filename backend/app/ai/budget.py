from __future__ import annotations

from datetime import timedelta
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.llm import Usage
from app.config import settings
from app.db import utcnow
from app.models import AiUsage, User

Kind = Literal["review", "chat", "suggest", "generate"]


def daily_limit(kind: Kind) -> int:
    return {
        "review": settings.ai_daily_reviews,
        "chat": settings.ai_daily_messages,
        "suggest": settings.ai_daily_suggestions,
        "generate": settings.ai_daily_generations,
    }[kind]


async def month_spend(db: AsyncSession) -> float:
    now = utcnow()
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    total = await db.scalar(
        select(func.coalesce(func.sum(AiUsage.cost_usd), 0)).where(AiUsage.created_at >= start)
    )
    return float(total or 0)


async def used_today(db: AsyncSession, user: User, kind: Kind) -> int:
    since = utcnow() - timedelta(days=1)
    count = await db.scalar(
        select(func.count()).where(
            AiUsage.user_id == user.id, AiUsage.kind == kind, AiUsage.created_at >= since
        )
    )
    return int(count or 0)


def availability(user: User) -> str | None:
    if user.is_guest:
        return "sign_up_for_ai"
    if not settings.gcp_project:
        return "ai_not_configured"
    return None


async def ensure_allowed(db: AsyncSession, user: User, kind: Kind) -> None:
    reason = availability(user)
    if reason == "sign_up_for_ai":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=reason)
    if reason:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=reason)
    if await month_spend(db) >= settings.ai_monthly_budget_usd:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="ai_budget_exhausted")
    if await used_today(db, user, kind) >= daily_limit(kind):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="ai_daily_limit")


async def record(db: AsyncSession, user: User, kind: Kind, usage: Usage) -> None:
    db.add(
        AiUsage(
            user_id=user.id,
            kind=kind,
            model=usage.model[:64],
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cost_usd=round(usage.cost_usd, 6),
            created_at=utcnow(),
        )
    )
    await db.commit()
