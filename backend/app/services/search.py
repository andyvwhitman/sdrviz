"""History queries over the transmissions table: filters, keyword search, window wrap-around, paging."""

import math
import re
from dataclasses import dataclass

from sqlalchemy import text
from sqlmodel import Session, col, select

from ..models import Transmission
from ..schemas import TransmissionOut
from ..sim.timefmt import DAY, hms, iso_from_offset
from ..sim.world import World

MAX_LIMIT = 500


@dataclass(frozen=True)
class TxFilter:
    """The query parameters of GET /transmissions (also used by the summary)."""

    start_t: float | None = None  # window, seconds after sim midnight (may be negative or > DAY)
    end_t: float | None = None
    frequency_id: str | None = None
    aar: int | None = None
    feed_id: str | None = None  # any feed that received the key-up
    role: str | None = None
    train_id: str | None = None
    place_id: str | None = None
    bank_id: str | None = None
    state: str | None = None
    min_duration: float | None = None
    defect: bool = False
    q: str | None = None


def fts_match(query: str) -> str | None:
    """A user's keywords as an FTS5 prefix query: 'marc 41' -> '"marc"* "41"*'. None if nothing searchable."""
    terms = re.findall(r"\w+", query)
    return " ".join(f'"{term}"*' for term in terms) or None


def _window(f: TxFilter) -> tuple[float, float] | None:
    if f.start_t is None and f.end_t is None:
        return None
    end = f.end_t if f.end_t is not None else f.start_t + DAY
    start = f.start_t if f.start_t is not None else end - DAY
    return start, end


def select_rows(session: Session, world: World, f: TxFilter) -> list[Transmission]:
    """Rows matching every filter that does not depend on the time window."""
    stmt = select(Transmission).where(Transmission.kind == "tx")
    for column, value in (
        (Transmission.frequency_id, f.frequency_id),
        (Transmission.aar_channel, f.aar),
        (Transmission.speaker_role, f.role),
        (Transmission.train_id, f.train_id),
        (Transmission.place_id, f.place_id),
        (Transmission.transcript_state, f.state),
    ):
        if value is not None:
            stmt = stmt.where(column == value)
    if f.min_duration is not None:
        stmt = stmt.where(Transmission.duration_s >= f.min_duration)
    if f.bank_id is not None:
        bank = world.bank(f.bank_id) if world.has_bank(f.bank_id) else None
        stmt = stmt.where(col(Transmission.frequency_id).in_(bank.frequency_ids if bank else []))
    if f.q:
        match = fts_match(f.q)
        ids = (
            [
                r[0]
                for r in session.execute(
                    text("SELECT tx_id FROM transmission_fts WHERE transmission_fts MATCH :m"), {"m": match}
                )
            ]
            if match
            else []
        )
        stmt = stmt.where(col(Transmission.id).in_(ids))
    rows = session.exec(stmt).all()
    if f.feed_id:
        rows = [r for r in rows if any(rec["feed_id"] == f.feed_id for rec in r.receptions)]
    if f.defect:
        rows = [r for r in rows if r.detector and r.detector.get("defect")]
    return list(rows)


def in_window(rows: list[Transmission], window: tuple[float, float] | None) -> list[tuple[Transmission, float]]:
    """(row, start time) pairs inside the window, repeating the day as often as the window needs."""
    if window is None:
        return [(r, r.t_offset_s) for r in rows]
    start, end = window
    first, last = math.floor(start / DAY) - 1, math.ceil(end / DAY) + 1
    return [(r, t) for r in rows for k in range(first, last + 1) if start <= (t := r.t_offset_s + k * DAY) < end]


def find(session: Session, world: World, f: TxFilter, order: str = "desc") -> list[tuple[Transmission, float]]:
    """All matches, sorted by (time, id) in the requested order."""
    pairs = in_window(select_rows(session, world, f), _window(f))
    return sorted(pairs, key=lambda p: (p[1], p[0].id), reverse=order == "desc")


def page(
    pairs: list[tuple[Transmission, float]], order: str, limit: int, cursor: str | None
) -> tuple[list, str | None]:
    """One page after `cursor` ("<t>|<id>", from the previous page's next_cursor)."""
    if cursor:
        t_text, _, row_id = cursor.partition("|")
        key = (float(t_text), row_id)
        pairs = [p for p in pairs if ((p[1], p[0].id) < key if order == "desc" else (p[1], p[0].id) > key)]
    items = pairs[:limit]
    more = len(pairs) > limit
    last = items[-1] if items else None
    return items, f"{last[1]}|{last[0].id}" if more and last else None


def to_out(row: Transmission, t: float) -> TransmissionOut:
    data = row.model_dump(exclude={"kind"})
    return TransmissionOut(**{**data, "t_offset_s": t, "started_at": iso_from_offset(t), "clock": hms(t)})
