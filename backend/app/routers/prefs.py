from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..auth import CurrentRole
from ..deps import RT
from ..models import Prefs
from ..runtime import Runtime
from ..schemas import PrefsModel

router = APIRouter(prefix="/prefs", tags=["prefs"])


def _out(prefs: Prefs) -> PrefsModel:
    return PrefsModel.model_validate(prefs, from_attributes=True)


def _effective(rt: Runtime) -> PrefsModel:
    """The prefs with `listen_feed` resolved: what Live Ops listens to now, even if nobody chose."""
    return _out(rt.prefs).model_copy(update={"listen_feed": rt.listen_feed})


@router.get("")
def get_prefs(rt: RT) -> PrefsModel:
    return _effective(rt)


class PrefsPatch(BaseModel):
    """Only the fields sent change, so two tabs or devices cannot undo each other's other settings."""

    listen_feed: str | None = None
    muted: list[str] | None = None
    solo: list[str] | None = None
    record: list[str] | None = None
    volume: dict[str, float] | None = None


@router.put("")
async def put_prefs(body: PrefsModel, rt: RT, role: CurrentRole) -> PrefsModel:
    return _save(body, rt, role)


@router.patch("")
async def patch_prefs(body: PrefsPatch, rt: RT, role: CurrentRole) -> PrefsModel:
    merged = {**_effective(rt).model_dump(), **body.model_dump(exclude_unset=True)}
    return _save(PrefsModel(**merged), rt, role)


def _save(body: PrefsModel, rt: Runtime, role: str | None) -> PrefsModel:
    """Viewers may change their mute, solo, record and volume; the node being listened to is shared and admin only."""
    changed = body.listen_feed is not None and body.listen_feed != rt.listen_feed
    if changed and role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    if body.listen_feed is not None and body.listen_feed not in rt.world.feeds:
        raise HTTPException(status_code=422, detail=f"Unknown feed {body.listen_feed!r}")
    listen_feed = body.listen_feed if changed else rt.prefs.listen_feed  # sending today's default does not pin it
    rt.save_prefs(Prefs(id=1, **{**body.model_dump(), "listen_feed": listen_feed}))
    if changed:
        rt.publish_snapshot()
    return _effective(rt)
