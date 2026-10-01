from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import delete, select

from app.deps import (
    SESSION_COOKIE,
    CurrentUser,
    Db,
    OptionalUser,
    clear_session_cookie,
    create_session,
    set_session_cookie,
)
from app.models import Role, User, UserSession, Workspace, WorkspaceMember
from app.ratelimit import client_ip, enforce, guest_limiter, login_limiter, signup_limiter
from app.schemas.auth import LoginIn, SignupIn, UpdateMeIn
from app.schemas.common import UserOut
from app.security import hash_password, pick_color, token_hash, verify_password
from app.services.guests import absorb_guest, create_guest, rename_guest_workspaces

router = APIRouter(prefix="/auth", tags=["auth"])


def default_workspace_name(name: str) -> str:
    return f"{name}'s workspace"


@router.post("/guest", status_code=status.HTTP_201_CREATED, response_model=UserOut)
async def guest(request: Request, response: Response, db: Db, current: OptionalUser) -> User:
    if current is not None:
        response.status_code = status.HTTP_200_OK
        return current
    enforce(guest_limiter, client_ip(request))
    user = await create_guest(db)
    token = await create_session(db, user, request.headers.get("user-agent"))
    await db.commit()
    set_session_cookie(response, token)
    return user


@router.post("/signup", status_code=status.HTTP_201_CREATED, response_model=UserOut)
async def signup(body: SignupIn, request: Request, response: Response, db: Db, current: OptionalUser) -> User:
    enforce(signup_limiter, client_ip(request))
    if await db.scalar(select(User.id).where(User.email == body.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="email_taken")
    if current is not None and current.is_guest:
        user = current
        user.email = body.email
        user.name = body.name
        user.password_hash = hash_password(body.password)
        user.is_guest = False
        await rename_guest_workspaces(db, user, default_workspace_name(body.name))
        await db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    else:
        user = User(
            email=body.email,
            name=body.name,
            password_hash=hash_password(body.password),
            color=pick_color(body.email),
        )
        db.add(user)
        await db.flush()
        workspace = Workspace(name=default_workspace_name(user.name), created_by=user.id)
        db.add(workspace)
        await db.flush()
        db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=Role.owner))
    token = await create_session(db, user, request.headers.get("user-agent"))
    await db.commit()
    set_session_cookie(response, token)
    return user


@router.post("/login", response_model=UserOut)
async def login(body: LoginIn, request: Request, response: Response, db: Db, current: OptionalUser) -> User:
    enforce(login_limiter, f"{client_ip(request)}:{body.email}")
    user = await db.scalar(select(User).where(User.email == body.email))
    valid, new_hash = verify_password(body.password, user.password_hash if user else None)
    if user is None or not valid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
    if new_hash:
        user.password_hash = new_hash
    if current is not None and current.is_guest:
        await absorb_guest(db, current, user)
    token = await create_session(db, user, request.headers.get("user-agent"))
    await db.commit()
    set_session_cookie(response, token)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, db: Db) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        await db.execute(delete(UserSession).where(UserSession.id == token_hash(token)))
        await db.commit()
    clear_session_cookie(response)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserOut)
async def update_me(body: UpdateMeIn, user: CurrentUser, db: Db) -> User:
    user = await db.merge(user)
    if body.name is not None:
        user.name = body.name
    if body.color is not None:
        user.color = body.color.upper()
    if body.new_password is not None:
        if user.is_guest:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="sign_up_first")
        if user.password_hash is not None:
            valid, _ = verify_password(body.current_password or "", user.password_hash)
            if not valid:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="wrong_password")
        user.password_hash = hash_password(body.new_password)
    await db.commit()
    return user
