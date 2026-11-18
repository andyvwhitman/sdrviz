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


@router.get("")
def get_prefs(rt: RT) -> PrefsModel:
    return _out(rt.prefs)


class PrefsPatch(BaseModel):
    """Only the fields sent change, so two tabs or devices cannot undo each other's other settings."""

    active_bank: str | None = None
    displayed_feed: str | None = None
    muted: list[str] | None = None
    solo: list[str] | None = None
    record: list[str] | None = None
    volume: dict[str, float] | None = None


@router.put("")
async def put_prefs(body: PrefsModel, rt: RT, role: CurrentRole) -> PrefsModel:
    return _save(body, rt, role)


@router.patch("")
async def patch_prefs(body: PrefsPatch, rt: RT, role: CurrentRole) -> PrefsModel:
    merged = {**_out(rt.prefs).model_dump(), **body.model_dump(exclude_unset=True)}
    return _save(PrefsModel(**merged), rt, role)


def _save(body: PrefsModel, rt: Runtime, role: str | None) -> PrefsModel:
    """Viewers may change their mute, solo, record and volume; the active bank and displayed feed are shared and
    admin only."""
    if role != "admin" and (body.active_bank, body.displayed_feed) != (rt.prefs.active_bank, rt.prefs.displayed_feed):
        raise HTTPException(status_code=403, detail="Admin only")
    if not rt.world.has_bank(body.active_bank):
        raise HTTPException(status_code=422, detail=f"Unknown bank {body.active_bank!r}")
    if body.displayed_feed is not None and body.displayed_feed not in rt.world.feeds:
        raise HTTPException(status_code=422, detail=f"Unknown feed {body.displayed_feed!r}")
    changed = (body.active_bank, body.displayed_feed) != (rt.prefs.active_bank, rt.prefs.displayed_feed)
    saved = rt.save_prefs(Prefs(id=1, **body.model_dump()))
    if changed:
        rt.publish_snapshot()
    return _out(saved)
