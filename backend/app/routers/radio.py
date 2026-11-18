from typing import Any

from fastapi import APIRouter

from ..auth import ADMIN
from ..deps import RT
from ..models import Receiver
from ..schemas import ReceiverIn

router = APIRouter(tags=["radio"])


@router.get("/radio")
def radio_status(rt: RT) -> dict[str, Any]:
    """Live radio connection: state, tuner, throughput (1.0 = full rate) and per-channel squelch."""
    return rt.radio.status


@router.get("/radio/settings", dependencies=[ADMIN])
def get_receiver(rt: RT) -> dict[str, Any]:
    """Not validated on the way out: before it is set up the receiver has no host, yet is enabled."""
    return rt.receiver.model_dump(exclude={"id"})


@router.put("/radio/settings", dependencies=[ADMIN])
async def put_receiver(body: ReceiverIn, rt: RT) -> dict[str, Any]:
    """Save the receiver settings and apply them now: the radio reconnects and retunes if it has to."""
    await rt.set_receiver(Receiver(id=1, **body.model_dump()))
    return get_receiver(rt)
