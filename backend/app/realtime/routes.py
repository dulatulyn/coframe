import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketState

from app.config import settings
from app.db import SessionLocal
from app.deps import SESSION_COOKIE, user_from_token
from app.models import Diagram, Project, User
from app.permissions import ProjectAccess, project_access
from app.realtime.hub import ProjectConnection, hub
from app.realtime.rooms import RoomConnection, rooms

router = APIRouter(prefix="/ws", tags=["realtime"])
log = logging.getLogger(__name__)

CLOSE_UNAUTHORIZED = 4401
CLOSE_FORBIDDEN = 4403
CLOSE_NOT_FOUND = 4404


def _public(user: User) -> dict[str, Any]:
    return {"id": str(user.id), "name": user.name, "color": user.color, "avatarUrl": user.avatar_url}


def _origin_allowed(websocket: WebSocket) -> bool:
    origin = websocket.headers.get("origin")
    return origin is None or origin in settings.allowed_origins


async def _authorize(websocket: WebSocket, load: Any) -> tuple[User, Project, ProjectAccess, Any] | None:
    await websocket.accept()
    if not _origin_allowed(websocket):
        await websocket.close(CLOSE_FORBIDDEN, "origin_not_allowed")
        return None
    async with SessionLocal() as db:
        user = await user_from_token(db, websocket.cookies.get(SESSION_COOKIE))
        if user is None:
            await websocket.close(CLOSE_UNAUTHORIZED, "not_authenticated")
            return None
        loaded = await load(db)
        if loaded is None:
            await websocket.close(CLOSE_NOT_FOUND, "not_found")
            return None
        project, target = loaded
        if project is None or project.deleted_at is not None:
            await websocket.close(CLOSE_NOT_FOUND, "not_found")
            return None
        access = await project_access(db, user, project)
        if access is None:
            await websocket.close(CLOSE_FORBIDDEN, "forbidden")
            return None
    return user, project, access, target


def _parse_uuid(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


async def _receive(websocket: WebSocket) -> dict[str, Any] | None:
    message = await websocket.receive()
    if message["type"] == "websocket.disconnect":
        return None
    return message


@router.websocket("/diagrams/{diagram_id}")
async def diagram_socket(websocket: WebSocket, diagram_id: str) -> None:
    parsed = _parse_uuid(diagram_id)

    async def load(db: Any) -> tuple[Project | None, Diagram] | None:
        if parsed is None:
            return None
        diagram = await db.get(Diagram, parsed)
        if diagram is None or diagram.deleted_at is not None or diagram.kind != "bpmn":
            return None
        return await db.get(Project, diagram.project_id), diagram

    authorized = await _authorize(websocket, load)
    if authorized is None:
        return
    user, _project, access, diagram = authorized

    room = await rooms.get(diagram.id)
    conn = RoomConnection(socket=websocket, user_id=user.id, user=_public(user), can_edit=access.can_edit)
    await room.join(conn)
    try:
        while True:
            message = await _receive(websocket)
            if message is None:
                break
            data = message.get("bytes")
            if data is None and message.get("text") is not None:
                data = message["text"].encode()
            if data:
                await room.handle(conn, data)
    except Exception:
        if websocket.client_state != WebSocketState.DISCONNECTED:
            log.exception("diagram socket error")
    finally:
        conn.closed = True
        await room.leave(conn)


@router.websocket("/projects/{project_id}")
async def project_socket(websocket: WebSocket, project_id: str) -> None:
    parsed = _parse_uuid(project_id)

    async def load(db: Any) -> tuple[Project | None, None] | None:
        if parsed is None:
            return None
        return await db.get(Project, parsed), None

    authorized = await _authorize(websocket, load)
    if authorized is None:
        return
    user, project, access, _ = authorized

    conn = ProjectConnection(
        socket=websocket, user_id=user.id, user=_public(user), via_jam_only=access.via_jam_only
    )
    await hub.join(project.id, conn)
    try:
        while True:
            message = await _receive(websocket)
            if message is None:
                break
            try:
                payload = json.loads(message.get("text") or (message.get("bytes") or b"").decode() or "{}")
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            kind = payload.get("type") if isinstance(payload, dict) else None
            if kind == "ping":
                await conn.send({"type": "pong"})
            elif kind == "presence":
                diagram = payload.get("diagramId")
                await hub.set_diagram(
                    project.id, conn, diagram if isinstance(diagram, str) and len(diagram) <= 64 else None
                )
    except Exception:
        if websocket.client_state != WebSocketState.DISCONNECTED:
            log.exception("project socket error")
    finally:
        await hub.leave(project.id, conn)
