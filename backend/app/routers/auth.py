from fastapi import APIRouter, HTTPException, Request, Response

from ..auth import current_role, role_for_password
from ..schemas import LoginIn, SessionOut
from .system import VERSION, _git_commit

router = APIRouter(prefix="/auth", tags=["auth"])


def _wait(seconds: float) -> dict[str, str]:
    return {"Retry-After": str(max(1, round(seconds + 0.5)))}


@router.post("/login", status_code=204)
def login(body: LoginIn, request: Request) -> Response:
    client = request.client.host if request.client else "unknown"
    limiter = request.app.state.limiter
    if wait := limiter.locked_for(client):
        raise HTTPException(status_code=423, detail="Locked after repeated wrong passwords", headers=_wait(wait))
    if wait := limiter.retry_after(client):
        raise HTTPException(status_code=429, detail="Too many login attempts; try again shortly", headers=_wait(wait))
    settings = request.app.state.rt.settings
    role = role_for_password(body.password, settings.password, settings.admin_password)
    if role is None:
        limiter.record(client)
        raise HTTPException(status_code=401, detail="Wrong password")
    limiter.clear(client)
    request.session["user"] = role
    return Response(status_code=204)


@router.post("/logout", status_code=204)
def logout(request: Request) -> Response:
    request.session.clear()
    return Response(status_code=204)


@router.get("/session")
def session(request: Request) -> SessionOut:
    role = current_role(request)
    return SessionOut(
        authenticated=role is not None,
        sim=request.app.state.rt.settings.sim,
        role=role,
        version=VERSION,
        commit=_git_commit(),
    )
