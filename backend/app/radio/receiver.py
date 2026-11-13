"""Where the receiver's settings live: the database row when saved, else the SDRVIZ_RTLTCP_* defaults."""

from sqlalchemy.engine import Engine

from ..config import Settings
from ..db import open_session
from ..models import Receiver


def default_receiver(settings: Settings) -> Receiver:
    return Receiver(
        name=settings.rtltcp_name,
        host=settings.rtltcp_host or "",
        port=settings.rtltcp_port,
        freq_hz=settings.rtltcp_freq_hz,
        rate=settings.rtltcp_rate,
        gain_db=settings.rtltcp_gain_db,
        squelch_db=settings.squelch_db,
        lat=settings.rtltcp_lat,
        lon=settings.rtltcp_lon,
    )


def load_receiver(engine: Engine, settings: Settings) -> Receiver:
    with open_session(engine) as session:
        return session.get(Receiver, 1) or default_receiver(settings)


def save_receiver(engine: Engine, receiver: Receiver) -> None:
    with open_session(engine) as session:
        session.merge(receiver)
        session.commit()


def is_active(receiver: Receiver) -> bool:
    """Whether the radio should be connected."""
    return receiver.enabled and bool(receiver.host)


def retunes(old: Receiver, new: Receiver) -> bool:
    """Whether going from `old` to `new` needs a new rtl_tcp session (the rest applies on the fly)."""
    keys = ("host", "port", "freq_hz", "rate", "gain_db")
    return is_active(old) != is_active(new) or any(getattr(old, key) != getattr(new, key) for key in keys)
