from typing import Any

from fastapi import APIRouter

from ..deps import RT
from ..sim.live_state import system_block

router = APIRouter(tags=["system"])

VERSION = "0.1.0"


@router.get("/system")
def system(rt: RT) -> dict[str, Any]:
    """Host, decoder and disk readings at the sim clock (the `system` block of LiveState)."""
    block = system_block(rt.data, rt.clock.now())
    return {**block, "version": VERSION, "sim": True}


@router.get("/live/state")
def live_state(rt: RT) -> dict[str, Any]:
    """The current LiveState: the same object the WebSocket sends as `snapshot`."""
    return rt.live_state()
