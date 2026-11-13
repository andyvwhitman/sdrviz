"""History summary: totals, the hero line and the 24 h airtime scrubber for a filtered window."""

from dataclasses import replace

from sqlmodel import Session

from ..models import Transmission
from ..sim.timefmt import DAY, hms, total_label
from ..sim.world import World
from . import search
from .search import TxFilter


def aired(row: Transmission, t: float, end: float) -> float:
    """Seconds of the key-up on the air by `end` (a live one counts only its elapsed time)."""
    return max(0.0, min(row.duration_s, end - t))


def summarize(session: Session, world: World, f: TxFilter, end: float) -> dict:
    """The scenario `history.{range, totals, hero, scrubber_*}` shape.

    `f` carries the window and filters. History lists released key-ups only (a live one is the
    header chip until it ends), so the totals skip anything that ends after the window.
    """
    start = f.start_t if f.start_t is not None else end - 3600
    released = [
        (row, t)
        for row, t in search.find(session, world, _with_window(f, start, end), "asc")
        if t + row.duration_s <= end
    ]
    airtime = sum(row.duration_s for row, _ in released)

    scrub = [0.0] * 1440
    day_start = end - DAY
    for row, t in search.find(session, world, _with_window(f, day_start, end + 0.001), "asc"):
        if t <= end:
            scrub[min(1439, int((t - day_start) // 60))] += aired(row, t, end)

    return {
        "range": {"start_t": start, "end_t": end, "start": hms(start)[:5], "end": hms(end)[:5]},
        "totals": {
            "count": len(released),
            "airtime_s": round(airtime, 1),
            "airtime_label": total_label(airtime),
        },
        "hero": f"{hms(start)[:5]}–{hms(end)[:5]} EST · {len(released)} TRANSMISSIONS · {total_label(airtime)} AIRTIME",
        "scrubber_start_t": day_start,
        "scrubber_airtime_per_min": [round(v, 1) for v in scrub],
    }


def _with_window(f: TxFilter, start: float, end: float) -> TxFilter:
    return replace(f, start_t=start, end_t=end)
