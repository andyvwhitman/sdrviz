"""Time and label formatting for the simulated day.

Times are seconds after local midnight (EST, UTC-05:00) on SIM_DATE. The day repeats:
"yesterday" is the same recorded day shifted by -24 h. The labels here match
`HUD.fmt` in design/mockups/_shared/hud.js and `tools/gen_sim.py`.
"""

import math
from datetime import datetime, timedelta, timezone

DAY = 86_400
SIM_DATE = "2026-11-10"
TZ = {"name": "EST", "iana": "America/New_York", "utc_offset": "-05:00"}

_EST = timezone(timedelta(hours=-5))
_MIDNIGHT = datetime.fromisoformat(f"{SIM_DATE}T00:00:00").replace(tzinfo=_EST)


def parse_clock(text: str) -> float:
    """'HH:MM', 'HH:MM:SS' or 'HH:MM:SS.s' -> seconds after midnight."""
    parts = [float(p) for p in text.split(":")]
    parts += [0.0] * (3 - len(parts))
    hours, minutes, seconds = parts
    return hours * 3600 + minutes * 60 + seconds


def hms(t: float, tenths: bool = False) -> str:
    t %= DAY
    hours, rem = divmod(t, 3600)
    minutes, seconds = divmod(rem, 60)
    if tenths:
        seconds = round(seconds, 1)
        if seconds >= 60:  # rounding carried into the next minute
            return hms(math.floor(t) + 1 - (t % 1), tenths=True)
        return f"{int(hours):02d}:{int(minutes):02d}:{seconds:04.1f}"
    return f"{int(hours):02d}:{int(minutes):02d}:{int(seconds):02d}"


def age_label(seconds: float, form: str = "last") -> str:
    """Compact instrument age: 48S, 4M, 1H 12M, 2D 3H. form="age" keeps seconds under 10 min."""
    s = max(0, int(seconds))
    if s < 60:
        return f"{s}S"
    if s < 3600:
        if form == "age" and s < 600:
            return f"{s // 60}M {s % 60}S"
        return f"{s // 60}M"
    if s < DAY:
        return f"{s // 3600}H {(s % 3600) // 60}M"
    return f"{s // DAY}D {(s % DAY) // 3600}H"


def total_label(seconds: float) -> str:
    """Airtime totals are always HH:MM:SS."""
    s = int(round(seconds))
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


def aar4(channel: int) -> str:
    return f"{channel:02d}{channel:02d}"


def iso_from_offset(t: float) -> str:
    """Day-relative seconds -> ISO-8601 with the EST offset (negative t is the previous day)."""
    return (_MIDNIGHT + timedelta(seconds=t)).isoformat(timespec="milliseconds")


def offset_from_iso(text: str) -> float:
    """ISO-8601 -> day-relative seconds (outside 0..DAY for other dates). Naive input is read as EST."""
    moment = datetime.fromisoformat(text)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=_EST)
    return (moment - _MIDNIGHT).total_seconds()
