from __future__ import annotations

import asyncio
import contextlib
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol

from pycrdt import Doc, Map, TransactionEvent
from sqlalchemy import func, select, update

from app.bpmn.flat import flatten_xml, reconstruct_xml
from app.bpmn.templates import new_diagram_xml
from app.config import settings
from app.db import SessionLocal, utcnow
from app.models import Diagram, DiagramVersion, Project, User
from app.realtime.awareness import AwarenessEntry, decode_update, encode_update, with_user
from app.realtime.encoding import (
    MESSAGE_AWARENESS,
    MESSAGE_QUERY_AWARENESS,
    MESSAGE_SYNC,
    SYNC_STEP1,
    SYNC_STEP2,
    SYNC_UPDATE,
    DecodeError,
    Decoder,
    awareness_message,
    persisted_message,
    sync_message,
)
from app.services.versions import record_version

log = logging.getLogger(__name__)

ELEMENTS = "elements"
CLOSE_ACCESS_REVOKED = 4403
CLOSE_RESET = 4409


class RoomSocket(Protocol):
    async def send_bytes(self, data: bytes) -> None: ...
    async def close(self, code: int = 1000, reason: str | None = None) -> None: ...


@dataclass(eq=False)
class RoomConnection:
    socket: RoomSocket
    user_id: uuid.UUID
    user: dict[str, Any]
    can_edit: bool
    client_ids: set[int] = field(default_factory=set)
    closed: bool = False
    _send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def send(self, data: bytes) -> None:
        if self.closed:
            return
        async with self._send_lock:
            await self.socket.send_bytes(data)

    async def close(self, code: int, reason: str) -> None:
        if self.closed:
            return
        self.closed = True
        with contextlib.suppress(Exception):
            await self.socket.close(code=code, reason=reason)


class DiagramRoom:
    def __init__(self, manager: RoomManager, diagram_id: uuid.UUID, project_id: uuid.UUID, doc: Doc) -> None:
        self.manager = manager
        self.diagram_id = diagram_id
        self.project_id = project_id
        self.doc = doc
        self.connections: set[RoomConnection] = set()
        self.awareness: dict[int, AwarenessEntry] = {}
        self._awareness_owner: dict[int, RoomConnection] = {}
        self.dirty = False
        self.closed = False
        self._last_editor: uuid.UUID | None = None
        self._version_editor: uuid.UUID | None = None
        self._unversioned = False
        self._last_version_at: datetime | None = None
        self._last_xml: str | None = None
        self._changes: list[bytes] = []
        self._save_task: asyncio.Task[None] | None = None
        self._save_lock = asyncio.Lock()
        self._version_lock = asyncio.Lock()
        self.unload_task: asyncio.Task[None] | None = None
        self._subscription = doc.observe(self._on_change)

    def _on_change(self, event: TransactionEvent) -> None:
        self._changes.append(bytes(event.update))

    def _apply(self, update_bytes: bytes) -> list[bytes]:
        self._changes = []
        self.doc.apply_update(update_bytes)
        changes, self._changes = self._changes, []
        return changes

    def elements(self) -> dict[str, dict[str, str]]:
        return self.doc.get(ELEMENTS, type=Map).to_py() or {}

    async def join(self, conn: RoomConnection) -> None:
        if self.unload_task is not None:
            self.unload_task.cancel()
            self.unload_task = None
        self.connections.add(conn)
        await conn.send(sync_message(SYNC_STEP1, self.doc.get_state()))
        if self.awareness:
            await conn.send(awareness_message(encode_update(list(self.awareness.values()))))

    async def leave(self, conn: RoomConnection) -> None:
        self.connections.discard(conn)
        removed = []
        for client_id in conn.client_ids:
            entry = self.awareness.pop(client_id, None)
            self._awareness_owner.pop(client_id, None)
            if entry is not None:
                removed.append(AwarenessEntry(client_id, entry.clock + 1, "null"))
        if removed:
            await self.broadcast(awareness_message(encode_update(removed)))
        if not self.connections and not self.closed:
            self.manager.schedule_unload(self)

    async def handle(self, conn: RoomConnection, data: bytes) -> None:
        try:
            decoder = Decoder(data)
            kind = decoder.read_var_uint()
            if kind == MESSAGE_SYNC:
                await self._handle_sync(conn, decoder.read_var_uint(), decoder.read_var_uint8_array())
            elif kind == MESSAGE_AWARENESS:
                await self._handle_awareness(conn, decoder.read_var_uint8_array())
            elif kind == MESSAGE_QUERY_AWARENESS and self.awareness:
                await conn.send(awareness_message(encode_update(list(self.awareness.values()))))
        except DecodeError:
            log.warning("malformed message from %s in diagram %s", conn.user_id, self.diagram_id)

    async def _handle_sync(self, conn: RoomConnection, sync_type: int, payload: bytes) -> None:
        if sync_type == SYNC_STEP1:
            await conn.send(sync_message(SYNC_STEP2, self.doc.get_update(payload)))
            return
        if sync_type not in (SYNC_STEP2, SYNC_UPDATE) or not conn.can_edit:
            return
        try:
            changes = self._apply(payload)
        except Exception:
            log.warning("rejected an invalid update from %s in diagram %s", conn.user_id, self.diagram_id)
            return
        for change in changes:
            await self.broadcast(sync_message(SYNC_UPDATE, change), exclude=conn)
        if changes:
            self.mark_dirty(conn.user_id)

    async def _handle_awareness(self, conn: RoomConnection, update_bytes: bytes) -> None:
        accepted: list[AwarenessEntry] = []
        for entry in decode_update(update_bytes):
            owner = self._awareness_owner.get(entry.client_id)
            if owner is not None and owner is not conn:
                continue
            if entry.removed:
                conn.client_ids.discard(entry.client_id)
                self._awareness_owner.pop(entry.client_id, None)
                self.awareness.pop(entry.client_id, None)
                accepted.append(entry)
                continue
            conn.client_ids.add(entry.client_id)
            self._awareness_owner[entry.client_id] = conn
            state = AwarenessEntry(entry.client_id, entry.clock, with_user(entry.state, conn.user))
            self.awareness[entry.client_id] = state
            accepted.append(state)
        if accepted:
            await self.broadcast(awareness_message(encode_update(accepted)))

    async def broadcast(self, data: bytes, exclude: RoomConnection | None = None) -> None:
        targets = [c for c in self.connections if c is not exclude and not c.closed]
        results = await asyncio.gather(*(c.send(data) for c in targets), return_exceptions=True)
        for conn, result in zip(targets, results, strict=True):
            if isinstance(result, Exception):
                self.connections.discard(conn)

    async def close_all(self, code: int, reason: str) -> None:
        for conn in list(self.connections):
            await conn.close(code, reason)

    def mark_dirty(self, editor: uuid.UUID | None) -> None:
        self.dirty = True
        if editor is not None:
            self._last_editor = editor
            self._version_editor = editor
            self._unversioned = True
        if self._save_task is None or self._save_task.done():
            self._save_task = asyncio.create_task(self._save_later())

    async def _save_later(self) -> None:
        while not self.closed:
            await asyncio.sleep(settings.ydoc_save_delay)
            await self.save()
            if not self.dirty:
                return

    async def save(self) -> None:
        async with self._save_lock:
            if not self.dirty:
                return
            self.dirty = False
            state = self.doc.get_update()
            state_vector = self.doc.get_state()
            now = utcnow()
            values: dict[str, Any] = {"ydoc_state": state, "content_updated_at": now, "updated_at": now}
            if self._last_editor is not None:
                values["updated_by"] = select(User.id).where(User.id == self._last_editor).scalar_subquery()
            elements = self.elements()
            if elements:
                try:
                    values["xml"] = reconstruct_xml(elements)
                except Exception:
                    log.exception("could not rebuild XML for diagram %s", self.diagram_id)
            if "xml" in values:
                self._last_xml = values["xml"]
            try:
                async with SessionLocal() as db:
                    await db.execute(update(Diagram).where(Diagram.id == self.diagram_id).values(**values))
                    await db.execute(
                        update(Project).where(Project.id == self.project_id).values(updated_at=now)
                    )
                    await db.commit()
            except Exception:
                log.exception("saving diagram %s failed; will retry", self.diagram_id)
                self.mark_dirty(None)
                return
        await self.broadcast(persisted_message(state_vector))
        due = self._last_version_at is None or (now - self._last_version_at).total_seconds() >= (
            settings.version_interval
        )
        if due:
            await self.snapshot()

    async def snapshot(self) -> None:
        async with self._version_lock:
            if not self._unversioned or self._last_xml is None:
                return
            xml = self._last_xml
            self._unversioned = False
            try:
                async with SessionLocal() as db:
                    await record_version(db, self.diagram_id, xml, self._version_editor, "auto")
                    await db.commit()
            except Exception:
                log.exception("could not record a version of diagram %s", self.diagram_id)
                self._unversioned = True
                return
            self._last_version_at = utcnow()

    def dispose(self) -> None:
        self.closed = True
        for task in (self._save_task, self.unload_task):
            if task is not None and not task.done() and task is not asyncio.current_task():
                task.cancel()
        with contextlib.suppress(Exception):
            self.doc.unobserve(self._subscription)


def build_doc(xml: str | None, ydoc_state: bytes | None) -> tuple[Doc, bool]:
    doc = Doc()
    elements = doc.get(ELEMENTS, type=Map)
    if ydoc_state:
        doc.apply_update(ydoc_state)
        if len(elements) > 0:
            return doc, False
    try:
        entries = flatten_xml(xml or new_diagram_xml())
    except Exception:
        log.exception("stored XML is unreadable; starting from a blank diagram")
        entries = flatten_xml(new_diagram_xml())
    with doc.transaction():
        for key, entry in entries.items():
            elements[key] = Map(entry)
    return doc, True


class RoomManager:
    def __init__(self) -> None:
        self._rooms: dict[uuid.UUID, DiagramRoom] = {}
        self._loading: dict[uuid.UUID, asyncio.Future[DiagramRoom]] = {}

    def get_loaded(self, diagram_id: uuid.UUID) -> DiagramRoom | None:
        return self._rooms.get(diagram_id)

    async def get(self, diagram_id: uuid.UUID) -> DiagramRoom:
        room = self._rooms.get(diagram_id)
        if room is not None:
            return room
        pending = self._loading.get(diagram_id)
        if pending is not None:
            return await pending
        future: asyncio.Future[DiagramRoom] = asyncio.get_running_loop().create_future()
        self._loading[diagram_id] = future
        try:
            room = await self._load(diagram_id)
            self._rooms[diagram_id] = room
            future.set_result(room)
            return room
        except BaseException as exc:
            future.set_exception(exc)
            future.exception()
            raise
        finally:
            del self._loading[diagram_id]

    async def _load(self, diagram_id: uuid.UUID) -> DiagramRoom:
        async with SessionLocal() as db:
            row = (
                await db.execute(
                    select(Diagram.project_id, Diagram.xml, Diagram.ydoc_state).where(
                        Diagram.id == diagram_id
                    )
                )
            ).one()
            last_version_at = await db.scalar(
                select(func.max(DiagramVersion.created_at)).where(DiagramVersion.diagram_id == diagram_id)
            )
        doc, needs_save = build_doc(row.xml, row.ydoc_state)
        room = DiagramRoom(self, diagram_id, row.project_id, doc)
        room._last_version_at = last_version_at
        room._last_xml = row.xml
        if needs_save:
            room.mark_dirty(None)
        return room

    def schedule_unload(self, room: DiagramRoom) -> None:
        if room.unload_task is None or room.unload_task.done():
            room.unload_task = asyncio.create_task(self._unload_later(room))

    async def _unload_later(self, room: DiagramRoom) -> None:
        await asyncio.sleep(settings.room_unload_delay)
        if room.connections:
            return
        await room.save()
        await room.snapshot()
        if not room.connections and self._rooms.get(room.diagram_id) is room:
            del self._rooms[room.diagram_id]
            room.dispose()

    async def flush(self, diagram_id: uuid.UUID, *, snapshot: bool = False) -> None:
        room = self._rooms.get(diagram_id)
        if room is not None:
            await room.save()
            if snapshot:
                await room.snapshot()

    async def close_diagram(self, diagram_id: uuid.UUID, code: int, reason: str) -> None:
        room = self._rooms.pop(diagram_id, None)
        if room is None:
            return
        if code != CLOSE_RESET:
            await room.save()
        room.dispose()
        await room.close_all(code, reason)

    async def disconnect_users(
        self,
        project_id: uuid.UUID,
        user_ids: set[uuid.UUID] | None = None,
        *,
        jam_guests_only: bool = False,
    ) -> None:
        for room in list(self._rooms.values()):
            if room.project_id != project_id:
                continue
            for conn in list(room.connections):
                if user_ids is None or conn.user_id in user_ids:
                    await conn.close(CLOSE_ACCESS_REVOKED, "access_revoked")

    async def shutdown(self) -> None:
        for room in list(self._rooms.values()):
            await room.save()
            await room.snapshot()
            room.dispose()
            await room.close_all(1001, "server_shutdown")
        self._rooms.clear()


rooms = RoomManager()
