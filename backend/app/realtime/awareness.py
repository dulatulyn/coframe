from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.realtime.encoding import Decoder, encode_var_string, encode_var_uint


@dataclass
class AwarenessEntry:
    client_id: int
    clock: int
    state: str

    @property
    def removed(self) -> bool:
        return self.state == "null"


def decode_update(update: bytes) -> list[AwarenessEntry]:
    decoder = Decoder(update)
    count = decoder.read_var_uint()
    entries = []
    for _ in range(count):
        client_id = decoder.read_var_uint()
        clock = decoder.read_var_uint()
        state = decoder.read_var_string()
        entries.append(AwarenessEntry(client_id, clock, state))
    return entries


def encode_update(entries: list[AwarenessEntry]) -> bytes:
    out = bytearray(encode_var_uint(len(entries)))
    for entry in entries:
        out += encode_var_uint(entry.client_id)
        out += encode_var_uint(entry.clock)
        out += encode_var_string(entry.state)
    return bytes(out)


def with_user(state: str, user: dict[str, Any]) -> str:
    if state == "null":
        return state
    try:
        data = json.loads(state)
    except json.JSONDecodeError:
        return json.dumps({"user": user}, separators=(",", ":"))
    if not isinstance(data, dict):
        data = {}
    data["user"] = user
    return json.dumps(data, separators=(",", ":"), ensure_ascii=False)
