from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any

import httpx
from httpx_ws import WebSocketDisconnect, aconnect_ws
from httpx_ws.transport import ASGIWebSocketTransport
from pycrdt import Doc, Map

from app.main import app
from app.realtime.awareness import AwarenessEntry, decode_update, encode_update
from app.realtime.encoding import (
    MESSAGE_AWARENESS,
    MESSAGE_PERSISTED,
    MESSAGE_SYNC,
    SYNC_STEP1,
    SYNC_STEP2,
    SYNC_UPDATE,
    Decoder,
    awareness_message,
    sync_message,
)


def ws_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=ASGIWebSocketTransport(app), base_url="http://testserver")


async def login(client: httpx.AsyncClient, email: str, password: str) -> None:
    r = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text


class YClient:
    def __init__(self, ws: Any) -> None:
        self.ws = ws
        self.doc = Doc()
        self.elements = self.doc.get("elements", type=Map)
        self.awareness: dict[int, AwarenessEntry] = {}
        self.persisted: list[bytes] = []
        self.synced = asyncio.Event()
        self.closed: WebSocketDisconnect | None = None
        self._applying_remote = False
        self._outbox: list[bytes] = []
        self._subscription = self.doc.observe(self._on_local_change)
        self._reader: asyncio.Task[None] | None = None

    def _on_local_change(self, event: Any) -> None:
        if not self._applying_remote:
            self._outbox.append(bytes(event.update))

    async def start(self) -> None:
        await self.ws.send_bytes(sync_message(SYNC_STEP1, self.doc.get_state()))
        self._reader = asyncio.create_task(self._read())

    async def _read(self) -> None:
        try:
            while True:
                data = await self.ws.receive_bytes()
                await self._handle(data)
        except WebSocketDisconnect as exc:
            self.closed = exc
        except Exception as exc:
            self.closed = WebSocketDisconnect(code=1006, reason=str(exc))

    async def _handle(self, data: bytes) -> None:
        decoder = Decoder(data)
        kind = decoder.read_var_uint()
        if kind == MESSAGE_SYNC:
            sync_type = decoder.read_var_uint()
            payload = decoder.read_var_uint8_array()
            if sync_type == SYNC_STEP1:
                await self.ws.send_bytes(sync_message(SYNC_STEP2, self.doc.get_update(payload)))
            else:
                self._applying_remote = True
                try:
                    self.doc.apply_update(payload)
                finally:
                    self._applying_remote = False
                if sync_type == SYNC_STEP2:
                    self.synced.set()
        elif kind == MESSAGE_AWARENESS:
            for entry in decode_update(decoder.read_var_uint8_array()):
                if entry.removed:
                    self.awareness.pop(entry.client_id, None)
                else:
                    self.awareness[entry.client_id] = entry
        elif kind == MESSAGE_PERSISTED:
            self.persisted.append(decoder.read_var_uint8_array())

    async def flush(self) -> None:
        outbox, self._outbox = self._outbox, []
        for update in outbox:
            await self.ws.send_bytes(sync_message(SYNC_UPDATE, update))

    async def set_awareness(self, client_id: int, clock: int, state: dict[str, Any] | None) -> None:
        text = "null" if state is None else json.dumps(state)
        await self.ws.send_bytes(awareness_message(encode_update([AwarenessEntry(client_id, clock, text)])))

    def read(self) -> dict[str, dict[str, str]]:
        return self.elements.to_py() or {}

    async def stop(self) -> None:
        if self._reader is not None:
            self._reader.cancel()


@asynccontextmanager
async def ydiagram(client: httpx.AsyncClient, diagram_id: str, headers: dict[str, str] | None = None):
    async with aconnect_ws(
        f"http://testserver/api/ws/diagrams/{diagram_id}", client, headers=headers or {}
    ) as ws:
        y = YClient(ws)
        await y.start()
        try:
            yield y
        finally:
            await y.stop()


async def eventually(check, timeout: float = 3.0, interval: float = 0.02) -> None:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while True:
        try:
            if check():
                return
        except AssertionError:
            if loop.time() > deadline:
                raise
        if loop.time() > deadline:
            raise AssertionError("condition not met in time")
        await asyncio.sleep(interval)
