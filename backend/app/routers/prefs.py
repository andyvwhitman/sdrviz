from fastapi import APIRouter
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

    muted: list[str] | None = None
    solo: list[str] | None = None
    record: list[str] | None = None
    volume: dict[str, float] | None = None


@router.put("")
async def put_prefs(body: PrefsModel, rt: RT, role: CurrentRole) -> PrefsModel:
    return _save(body, rt)


@router.patch("")
async def patch_prefs(body: PrefsPatch, rt: RT, role: CurrentRole) -> PrefsModel:
    merged = {**_out(rt.prefs).model_dump(), **body.model_dump(exclude_unset=True)}
    return _save(PrefsModel(**merged), rt)


def _save(body: PrefsModel, rt: Runtime) -> PrefsModel:
    """Mute, solo, record and volume are shared, and any role may change them."""
    rt.save_prefs(Prefs(id=1, **body.model_dump()))
    return _out(rt.prefs)
