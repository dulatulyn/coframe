from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, select

from app import oauth_google
from app.api.auth import default_workspace_name
from app.deps import Db, OptionalUser, create_session, set_session_cookie
from app.models import Role, User, UserSession, Workspace, WorkspaceMember
from app.security import pick_color
from app.services.guests import absorb_guest, rename_guest_workspaces

router = APIRouter(prefix="/auth", tags=["auth"])


def _safe_next(value: str | None) -> str:
    return value if value and value.startswith("/") and not value.startswith("//") else "/app"


def _login_error(reason: str) -> RedirectResponse:
    return RedirectResponse(f"/login?error={reason}", status_code=303)


@router.get("/providers")
async def providers() -> dict[str, bool]:
    return {"google": oauth_google.enabled()}


@router.get("/google/start")
async def google_start(next: str | None = None) -> RedirectResponse:
    if not oauth_google.enabled():
        return _login_error("google_disabled")
    return RedirectResponse(oauth_google.begin(_safe_next(next)), status_code=303)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    db: Db,
    current: OptionalUser,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    if error or not code or not state or not oauth_google.enabled():
        return _login_error("google_cancelled" if error else "google_failed")
    try:
        pending = oauth_google.consume(state)
        profile = await oauth_google.fetch_profile(code, pending.verifier)
    except oauth_google.OAuthError:
        return _login_error("google_failed")
    if not profile.email_verified:
        return _login_error("google_unverified")

    user = await db.scalar(select(User).where(User.google_sub == profile.sub))
    if user is None:
        user = await db.scalar(select(User).where(User.email == profile.email))
        if user is not None:
            user.google_sub = profile.sub
    guest = current if current is not None and current.is_guest else None
    if user is None and guest is not None:
        user = guest
        user.email = profile.email
        user.name = (profile.name or profile.email.split("@")[0])[:200]
        user.google_sub = profile.sub
        user.avatar_url = profile.picture
        user.is_guest = False
        await rename_guest_workspaces(db, user, default_workspace_name(user.name))
        await db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    elif user is None:
        user = User(
            email=profile.email,
            name=(profile.name or profile.email.split("@")[0])[:200],
            password_hash=None,
            color=pick_color(profile.email),
            google_sub=profile.sub,
            avatar_url=profile.picture,
        )
        db.add(user)
        await db.flush()
        workspace = Workspace(name=default_workspace_name(user.name), created_by=user.id)
        db.add(workspace)
        await db.flush()
        db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=Role.owner))
    else:
        if guest is not None:
            await absorb_guest(db, guest, user)
        if profile.picture and user.avatar_url != profile.picture:
            user.avatar_url = profile.picture

    token = await create_session(db, user, request.headers.get("user-agent"))
    await db.commit()
    response = RedirectResponse(pending.next_path, status_code=303)
    set_session_cookie(response, token)
    return response
