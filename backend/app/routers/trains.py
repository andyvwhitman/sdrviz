from typing import Any

from fastapi import APIRouter, Query

from ..deps import RT
from ..sim import live_state
from ..sim.timefmt import DAY, offset_from_iso

router = APIRouter(prefix="/trains", tags=["trains"])


@router.get("")
def list_trains(
    rt: RT,
    start: str | None = None,
    end: str | None = None,
    route: str | None = None,
    q: str | None = Query(None, description="Substring of the train id, e.g. 'MARC 41'"),
) -> dict[str, list[dict[str, Any]]]:
    """Train runs (stops with times) for the stringline, optionally those active in a window."""
    window = None
    if start or end:
        end_t = offset_from_iso(end) if end else offset_from_iso(start) + DAY
        window = (offset_from_iso(start) if start else end_t - DAY, end_t)
    items = []
    for record in rt.data.train_records:
        if route and route not in record["routes"]:
            continue
        if q and q.lower() not in record["train_id"].lower():
            continue
        if window and not any(
            record["start_t"] + shift <= window[1] and record["end_t"] + shift >= window[0] for shift in (-DAY, 0, DAY)
        ):
            continue
        items.append(record)
    return {"items": items}


@router.get("/live")
def live_trains(rt: RT) -> list[dict[str, Any]]:
    t = rt.clock.now()
    positions, _ = live_state.trains_block(rt.inputs, t, rt.data.day.active_at(t))
    return positions
