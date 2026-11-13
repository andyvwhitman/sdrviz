"""FastAPI application: `uvicorn app.main:app --port 8100`."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from .auth import SESSION_COOKIE, LoginLimiter, require_session
from .config import REPO_ROOT, Settings
from .routers import (
    auth,
    banks,
    feeds,
    frequencies,
    geo,
    live,
    lofar,
    prefs,
    sim,
    stats,
    system,
    trains,
    transmissions,
)
from .runtime import Runtime

log = logging.getLogger("sdrviz")

PROTECTED = (system, sim, prefs, frequencies, banks, feeds, transmissions, stats, trains, geo, lofar)
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
        rt = Runtime(settings)
        app.state.rt = rt
        rt.start()
        if settings.password == "sdrviz":
            log.warning("using the default dev password %r (set SDRVIZ_PASSWORD)", settings.password)
        log.info("sdrviz backend ready: sim clock %s at %sx", rt.clock.now(), rt.clock.speed)
        yield
        await rt.stop()

    app = FastAPI(title="sdrviz", version="0.1.0", lifespan=lifespan)
    app.state.limiter = LoginLimiter()
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.secret,
        session_cookie=SESSION_COOKIE,
        same_site="lax",
        https_only=False,
        max_age=14 * 24 * 3600,
    )

    api = APIRouter(prefix="/api")
    api.include_router(auth.router)
    for module in PROTECTED:
        api.include_router(module.router, dependencies=[Depends(require_session)])
    app.include_router(api)
    app.include_router(live.router)

    if Path(FRONTEND_DIST).is_dir():
        app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
    return app


app = create_app()
