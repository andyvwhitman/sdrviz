from typing import Any

from fastapi import APIRouter, Query

from ..deps import RT
from ..sim import live_state
from ..sim.live_state import LOFAR_ROW_S

router = APIRouter(tags=["lofar"])


@router.get("/lofar")
def lofar(rt: RT, minutes: int = Query(60, ge=1, le=360)) -> dict[str, Any]:
    """Signal strength history per feed and channel: `rows` dBFS values (null: silent), oldest first."""
    t = rt.clock.now()
    rows = minutes * 60 // LOFAR_ROW_S
    end_bucket = int(t // LOFAR_ROW_S)  # the row in progress is not complete; history ends at the last full one
    row0_t = (end_bucket - rows) * LOFAR_ROW_S
    cells: dict[str, dict[str, list[float | None]]] = {fid: {} for fid in rt.world.feeds}
    for i in range(rows):
        start = row0_t + i * LOFAR_ROW_S
        for fid, channels in live_state.lofar_row(rt.inputs, start, start + LOFAR_ROW_S).items():
            if fid not in cells:
                continue
            for cid, dbfs in channels.items():
                cells[fid].setdefault(cid, [None] * rows)[i] = dbfs
    return {"row_s": LOFAR_ROW_S, "rows": rows, "row0_t": row0_t, "cells": cells}
