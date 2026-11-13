from fastapi import APIRouter, HTTPException, Request, Response

from ..auth import password_matches
from ..schemas import LoginIn, SessionOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", status_code=204)
def login(body: LoginIn, request: Request) -> Response:
    client = request.client.host if request.client else "unknown"
    if not request.app.state.limiter.allow(client):
        raise HTTPException(status_code=429, detail="Too many login attempts; try again in a minute")
    if not password_matches(body.password, request.app.state.rt.settings.password):
        raise HTTPException(status_code=401, detail="Wrong password")
    request.session["user"] = "admin"
    return Response(status_code=204)


@router.post("/logout", status_code=204)
def logout(request: Request) -> Response:
    request.session.clear()
    return Response(status_code=204)


@router.get("/session")
def session(request: Request) -> SessionOut:
    return SessionOut(authenticated=bool(request.session.get("user")))
