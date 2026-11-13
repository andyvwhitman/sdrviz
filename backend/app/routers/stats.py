from typing import Any, Literal

from fastapi import APIRouter

from ..deps import RT
from ..services.stats import stats_for

router = APIRouter(tags=["stats"])


@router.get("/stats")
def stats(rt: RT, range: Literal["today", "yesterday", "rolling_24h"] = "today") -> dict[str, Any]:
    """Analytics. `today` is the day so far up to the sim clock; `yesterday` is the full recorded day."""
    return stats_for(rt.world, rt.data.day, rt.data.kerchunks, rt.health, range, rt.clock.now())
