import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    ai,
    auth,
    diagrams,
    folders,
    invites,
    jams,
    me,
    oauth,
    projects,
    public,
    versions,
    workspaces,
)
from app.config import settings
from app.db import SessionLocal
from app.realtime import routes as realtime_routes
from app.realtime.rooms import rooms
from app.services.guests import purge_guests

log = logging.getLogger(__name__)
PURGE_INTERVAL_SECONDS = 3600


async def purge_guests_forever() -> None:
    while True:
        try:
            async with SessionLocal() as db:
                removed = await purge_guests(db)
            if removed:
                log.info("removed %d inactive guest accounts", removed)
        except Exception:
            log.exception("guest cleanup failed")
        await asyncio.sleep(PURGE_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    purge = asyncio.create_task(purge_guests_forever())
    yield
    purge.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await purge
    await rooms.shutdown()


def create_app() -> FastAPI:
    app = FastAPI(title=f"{settings.app_name} API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    api = APIRouter(prefix="/api")

    @api.get("/health", tags=["meta"])
    async def health() -> dict[str, bool]:
        return {"ok": True}

    for module in (
        auth,
        oauth,
        workspaces,
        invites,
        projects,
        folders,
        diagrams,
        versions,
        jams,
        me,
        ai,
        public,
    ):
        api.include_router(module.router)
    api.include_router(realtime_routes.router)
    app.include_router(api)
    return app


app = create_app()
