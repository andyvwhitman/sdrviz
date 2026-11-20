"""FastAPI application: `uvicorn app.main:app --port 8100`."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from .auth import ADMIN, SESSION_COOKIE, LoginLimiter, require_session
from .config import REPO_ROOT, Settings
from .origin import OriginCheck
from .routers import (
    auth,
    feeds,
    frequencies,
    geo,
    live,
    lofar,
    node_ws,
    nodes,
    prefs,
    radio,
    recordings,
    sim,
    system,
    trains,
    transit,
)
from .runtime import Runtime

log = logging.getLogger("sdrviz")

# recordings comes first: GET /frequencies/activity must be matched before GET /frequencies/{id}
PROTECTED = (recordings, system, radio, sim, prefs, frequencies, feeds, trains, transit, geo, lofar)
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    if settings.production and (problems := settings.production_problems()):
        raise RuntimeError("refusing to start a public site: " + "; ".join(problems))

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
        rt = Runtime(settings)
        app.state.rt = rt
        rt.start()
        if settings.password == "sdrviz":
            log.warning("using the default dev password %r (set SDRVIZ_PASSWORD)", settings.password)
        if settings.production and not settings.admin_password:
            log.warning("SDRVIZ_ADMIN_PASSWORD is not set: the one password gives admin rights to every visitor")
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
        https_only=settings.production,
        max_age=14 * 24 * 3600,
    )
    app.add_middleware(OriginCheck, public_url=settings.public_url)  # outermost: refuses before anything runs

    api = APIRouter(prefix="/api")
    api.include_router(auth.router)
    for module in PROTECTED:
        api.include_router(module.router, dependencies=[Depends(require_session)])
    api.include_router(nodes.router, dependencies=[ADMIN])  # the node fleet, keys and commands: admin only
    app.include_router(api)
    app.include_router(live.router)
    app.include_router(node_ws.router)

    if Path(FRONTEND_DIST).is_dir():
        app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
    return app


app = create_app()
