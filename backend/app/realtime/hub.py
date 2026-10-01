import asyncio
import contextlib
import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Protocol

log = logging.getLogger(__name__)


class ChannelSocket(Protocol):
    async def send_text(self, data: str) -> None: ...
    async def close(self, code: int = 1000, reason: str | None = None) -> None: ...


@dataclass(eq=False)
class ProjectConnection:
    socket: ChannelSocket
    user_id: uuid.UUID
    user: dict[str, str]
    diagram_id: str | None = None
    via_jam_only: bool = False
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def send(self, message: dict[str, Any]) -> None:
        async with self.send_lock:
            await self.socket.send_text(json.dumps(message, separators=(",", ":")))


class ProjectHub:
    def __init__(self) -> None:
        self._connections: dict[uuid.UUID, set[ProjectConnection]] = {}

    def connections(self, project_id: uuid.UUID) -> set[ProjectConnection]:
        return self._connections.get(project_id, set())

    async def join(self, project_id: uuid.UUID, conn: ProjectConnection) -> None:
        self._connections.setdefault(project_id, set()).add(conn)
        await self.broadcast_presence(project_id)

    async def leave(self, project_id: uuid.UUID, conn: ProjectConnection) -> None:
        conns = self._connections.get(project_id)
        if conns is None:
            return
        conns.discard(conn)
        if not conns:
            del self._connections[project_id]
        await self.broadcast_presence(project_id)

    async def set_diagram(
        self, project_id: uuid.UUID, conn: ProjectConnection, diagram_id: str | None
    ) -> None:
        if conn.diagram_id != diagram_id:
            conn.diagram_id = diagram_id
            await self.broadcast_presence(project_id)

    def presence(self, project_id: uuid.UUID) -> list[dict[str, Any]]:
        seen: set[tuple[str, str | None]] = set()
        users: list[dict[str, Any]] = []
        for conn in self.connections(project_id):
            key = (str(conn.user_id), conn.diagram_id)
            if key in seen:
                continue
            seen.add(key)
            users.append({"user": conn.user, "diagramId": conn.diagram_id})
        users.sort(key=lambda u: (u["user"]["name"].lower(), u["user"]["id"], u["diagramId"] or ""))
        return users

    async def broadcast_presence(self, project_id: uuid.UUID) -> None:
        await self.publish(project_id, {"type": "presence", "users": self.presence(project_id)})

    async def publish(self, project_id: uuid.UUID, message: dict[str, Any]) -> None:
        conns = list(self.connections(project_id))
        if not conns:
            return
        results = await asyncio.gather(*(c.send(message) for c in conns), return_exceptions=True)
        for conn, result in zip(conns, results, strict=True):
            if isinstance(result, Exception):
                log.debug("dropping project connection after send failure: %s", result)
                self.connections(project_id).discard(conn)

    async def disconnect_users(
        self, project_id: uuid.UUID, user_ids: set[uuid.UUID] | None = None, *, jam_guests_only: bool = False
    ) -> None:
        for conn in list(self.connections(project_id)):
            if user_ids is not None and conn.user_id not in user_ids:
                continue
            if jam_guests_only and not conn.via_jam_only:
                continue
            with contextlib.suppress(Exception):
                await conn.socket.close(code=4403, reason="access_revoked")


hub = ProjectHub()
