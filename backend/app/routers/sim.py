"""Fake-only endpoints: the replay clock. Delete this router (and lib/api/sim.ts) with the fake."""

from fastapi import APIRouter

from ..deps import RT
from ..schemas import JumpIn, SimOut
from ..sim.timefmt import hms

router = APIRouter(prefix="/sim", tags=["sim"])


def _state(rt: RT) -> SimOut:
    return SimOut(scenario=rt.scenario.name if rt.scenario else None, clock=hms(rt.clock.now()), speed=rt.clock.speed)


@router.get("")
def get_sim(rt: RT) -> SimOut:
    return _state(rt)


@router.post("/jump")
async def jump(body: JumpIn, rt: RT) -> SimOut:
    """Set the clock to a scripted scenario moment or an explicit time, and/or change its speed.

    Async so that the resync and snapshot run on the event loop, next to the replay engine.
    """
    rt.jump(scenario=body.scenario, clock=body.clock, speed=body.speed)
    return _state(rt)
