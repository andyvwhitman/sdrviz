"""Recordings and per-frequency activity (D-4). Everything here is readable by a viewer; nothing writes."""

from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import col, select

from ..deps import DB, RT
from ..recordings.models import Recording

router = APIRouter(tags=["recordings"])

TZ_NAME = "America/New_York"  # the days of the activity views are Eastern days, like the clock in the UI
TZ = ZoneInfo(TZ_NAME)
BUCKET = timedelta(minutes=15)
HOUR = timedelta(hours=1)


def iso(moment: datetime) -> str:
    """UTC with a Z, to the millisecond."""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class RecordingOut(BaseModel):
    id: int
    frequency_id: str
    aar_channel: int
    feed_id: str
    feed_lat: float | None
    feed_lon: float | None
    started_at: str
    duration_s: float
    audio_bytes: int
    audio_state: str
    audio_url: str | None  # None once the audio has expired
    transcript: str
    transcript_state: str
    engine: str


def out(row: Recording) -> RecordingOut:
    return RecordingOut(
        id=row.id,
        frequency_id=row.frequency_id,
        aar_channel=row.aar_channel,
        feed_id=row.feed_id,
        feed_lat=row.feed_lat,
        feed_lon=row.feed_lon,
        started_at=iso(row.started_at),
        duration_s=row.duration_s,
        audio_bytes=row.audio_bytes,
        audio_state=row.audio_state,
        audio_url=f"/api/recordings/{row.id}/audio" if row.audio_state == "ok" else None,
        transcript=row.transcript,
        transcript_state=row.transcript_state,
        engine=row.engine,
    )


# --- the recordings --------------------------------------------------------------------------------------------------


@router.get("/recordings")
def list_recordings(
    session: DB,
    frequency_id: str | None = None,
    before: datetime | None = None,  # only recordings that started before this moment (paging)
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[RecordingOut]:
    """Newest first. To page, pass the last row's `started_at` as `before`."""
    query = select(Recording).order_by(col(Recording.started_at).desc(), col(Recording.id).desc()).limit(limit)
    if frequency_id:
        query = query.where(Recording.frequency_id == frequency_id)
    if before:
        query = query.where(Recording.started_at < (before if before.tzinfo else before.replace(tzinfo=UTC)))
    return [out(row) for row in session.exec(query)]


def recording_or_404(session: DB, recording_id: int) -> Recording:
    row = session.get(Recording, recording_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"No recording {recording_id}")
    return row


@router.get("/recordings/{recording_id}")
def read_recording(recording_id: int, session: DB) -> RecordingOut:
    return out(recording_or_404(session, recording_id))


@router.get("/recordings/{recording_id}/audio")
def read_audio(recording_id: int, session: DB, rt: RT) -> FileResponse:
    """The Ogg Opus file; Range requests are answered (206), so a browser can seek."""
    row = recording_or_404(session, recording_id)
    if row.audio_state != "ok":
        raise HTTPException(status_code=410, detail="The audio of this recording has expired")
    root = rt.settings.audio_path.resolve()
    path = (root / row.audio_path).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(status_code=404, detail="The audio file is missing")
    return FileResponse(path, media_type="audio/ogg")


# --- activity ------------------------------------------------------------------------------------------------------


def local_day(day: date | None) -> date:
    return day or datetime.now(TZ).date()


def day_span(day: date) -> tuple[datetime, datetime]:
    """The UTC moments a local day starts and ends (23 to 25 hours long on a daylight saving change)."""
    start = datetime.combine(day, time(), tzinfo=TZ)
    end = datetime.combine(day + timedelta(days=1), time(), tzinfo=TZ)
    return start.astimezone(UTC), end.astimezone(UTC)


def buckets(rows: list[tuple[datetime, float]], start: datetime, end: datetime, step: timedelta) -> list[dict]:
    """Count and airtime of the recordings that started in each `step` of [start, end). A transmission is counted
    in the bucket it started in."""
    count = int((end - start) / step + 0.999)
    result = [{"start": iso(start + step * i), "count": 0, "airtime_s": 0.0} for i in range(count)]
    for started_at, duration_s in rows:
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=UTC)
        if start <= started_at < end:
            bucket = result[int((started_at - start) / step)]
            bucket["count"] += 1
            bucket["airtime_s"] = round(bucket["airtime_s"] + duration_s, 2)
    return result


def since(session: DB, frequency_id: str) -> str | None:
    """The start of the oldest recording of this frequency: before it, silence only means 'not recording yet'."""
    first = session.exec(select(func.min(Recording.started_at)).where(Recording.frequency_id == frequency_id)).one()
    return iso(first) if first else None


def rows_between(session: DB, start: datetime, end: datetime, frequency_id: str | None = None):
    query = select(Recording.frequency_id, Recording.started_at, Recording.duration_s)
    query = query.where(Recording.started_at >= start, Recording.started_at < end)
    if frequency_id:
        query = query.where(Recording.frequency_id == frequency_id)
    return session.exec(query).all()


def known_frequency(rt: RT, frequency_id: str) -> str:
    if frequency_id not in rt.world.freqs:
        raise HTTPException(status_code=404, detail=f"No frequency {frequency_id!r}")
    return frequency_id


@router.get("/frequencies/activity")
def activity_of_all(session: DB, rt: RT, date: date | None = None) -> dict:
    """Day buckets of every frequency that is in a bank, in one call (the /frequency index)."""
    day = local_day(date)
    start, end = day_span(day)
    by_frequency: dict[str, list[tuple[datetime, float]]] = {}
    for frequency_id, started_at, duration_s in rows_between(session, start, end):
        by_frequency.setdefault(frequency_id, []).append((started_at, duration_s))
    oldest = select(Recording.frequency_id, func.min(Recording.started_at)).group_by(Recording.frequency_id)
    firsts = {frequency_id: iso(first) for frequency_id, first in session.exec(oldest)}
    return {
        "date": day.isoformat(),
        "tz": TZ_NAME,
        "frequencies": [
            {
                "frequency_id": frequency_id,
                "recording_since": firsts.get(frequency_id),
                "buckets": buckets(by_frequency.get(frequency_id, []), start, end, BUCKET),
            }
            for frequency_id in rt.world.freqs
            if rt.world.banks_of(frequency_id)
        ],
    }


@router.get("/frequencies/{frequency_id}/activity")
def activity_of_day(frequency_id: str, session: DB, rt: RT, date: date | None = None) -> dict:
    """One local day (today by default) in 15 minute buckets: 96 of them, 92 or 100 on a daylight saving change."""
    known_frequency(rt, frequency_id)
    day = local_day(date)
    start, end = day_span(day)
    rows = [(s, d) for _, s, d in rows_between(session, start, end, frequency_id)]
    return {
        "frequency_id": frequency_id,
        "date": day.isoformat(),
        "tz": TZ_NAME,
        "recording_since": since(session, frequency_id),
        "buckets": buckets(rows, start, end, BUCKET),
    }


@router.get("/frequencies/{frequency_id}/activity/week")
def activity_of_week(frequency_id: str, session: DB, rt: RT, date: date | None = None) -> dict:
    """The 7 local days ending on `date` (today by default), oldest first, each as 24 hourly buckets."""
    known_frequency(rt, frequency_id)
    last = local_day(date)
    days = [last - timedelta(days=n) for n in range(6, -1, -1)]
    start, end = day_span(days[0])[0], day_span(last)[1]
    rows = [(s, d) for _, s, d in rows_between(session, start, end, frequency_id)]
    return {
        "frequency_id": frequency_id,
        "tz": TZ_NAME,
        "recording_since": since(session, frequency_id),
        "days": [
            {"date": day.isoformat(), "hours": buckets(rows, *day_span(day), HOUR)}
            for day in days
        ],
    }  # fmt: skip
