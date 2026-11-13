from fastapi import APIRouter, HTTPException

from ..deps import RT
from ..models import Prefs
from ..schemas import PrefsModel

router = APIRouter(prefix="/prefs", tags=["prefs"])


def _out(prefs: Prefs) -> PrefsModel:
    return PrefsModel.model_validate(prefs, from_attributes=True)


@router.get("")
def get_prefs(rt: RT) -> PrefsModel:
    return _out(rt.prefs)


@router.put("")
async def put_prefs(body: PrefsModel, rt: RT) -> PrefsModel:
    if not rt.world.has_bank(body.active_bank):
        raise HTTPException(status_code=422, detail=f"Unknown bank {body.active_bank!r}")
    if body.displayed_feed is not None and body.displayed_feed not in rt.world.feeds:
        raise HTTPException(status_code=422, detail=f"Unknown feed {body.displayed_feed!r}")
    changed = (body.active_bank, body.displayed_feed) != (rt.prefs.active_bank, rt.prefs.displayed_feed)
    saved = rt.save_prefs(Prefs(id=1, **body.model_dump()))
    if changed:
        rt.publish_snapshot()
    return _out(saved)
