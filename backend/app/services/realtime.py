import logging
import uuid
from collections.abc import Awaitable, Iterable

from app.realtime.hub import hub
from app.realtime.rooms import rooms

log = logging.getLogger(__name__)

CLOSE_DELETED = 4404


async def _safely(action: Awaitable[None], what: str) -> None:
    try:
        await action
    except Exception:
        log.exception("realtime side effect failed: %s", what)


async def publish(project_id: uuid.UUID, kind: str) -> None:
    await _safely(hub.publish(project_id, {"type": kind}), f"publish {kind}")


async def flush_diagram(diagram_id: uuid.UUID) -> None:
    await _safely(rooms.flush(diagram_id), "flush")


async def close_deleted_diagrams(diagram_ids: Iterable[uuid.UUID]) -> None:
    for diagram_id in diagram_ids:
        await _safely(rooms.close_diagram(diagram_id, CLOSE_DELETED, "deleted"), "close_diagram")


async def disconnect(project_id: uuid.UUID, user_ids: set[uuid.UUID] | None) -> None:
    if user_ids is not None and not user_ids:
        return
    await _safely(hub.disconnect_users(project_id, user_ids), "hub.disconnect_users")
    await _safely(rooms.disconnect_users(project_id, user_ids), "rooms.disconnect_users")
