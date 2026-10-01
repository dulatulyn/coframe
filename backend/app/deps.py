from datetime import timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db, utcnow
from app.models import User, UserSession
from app.security import new_token, token_hash

SESSION_COOKIE = "sid"
COOKIE_MAX_AGE = 60 * 60 * 24 * 400
SESSION_TOUCH_INTERVAL = timedelta(hours=1)

Db = Annotated[AsyncSession, Depends(get_db)]


async def create_session(db: AsyncSession, user: User, user_agent: str | None) -> str:
    token = new_token()
    now = utcnow()
    db.add(
        UserSession(
            id=token_hash(token),
            user_id=user.id,
            created_at=now,
            last_seen_at=now,
            expires_at=now + timedelta(days=settings.session_ttl_days),
            user_agent=(user_agent or "")[:400] or None,
        )
    )
    return token


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", samesite="lax", secure=settings.cookie_secure)


async def user_from_token(db: AsyncSession, token: str | None) -> User | None:
    if not token:
        return None
    now = utcnow()
    session = await db.scalar(
        select(UserSession).where(UserSession.id == token_hash(token), UserSession.expires_at > now)
    )
    if session is None:
        return None
    if now - session.last_seen_at > SESSION_TOUCH_INTERVAL:
        session.last_seen_at = now
        session.expires_at = now + timedelta(days=settings.session_ttl_days)
        await db.commit()
    return session.user


async def get_optional_user(request: Request, db: Db) -> User | None:
    return await user_from_token(db, request.cookies.get(SESSION_COOKIE))


OptionalUser = Annotated[User | None, Depends(get_optional_user)]


async def get_current_user(user: OptionalUser) -> User:
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="not_authenticated")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
