from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response
from sqlmodel import col, delete

from ..auth import ADMIN
from ..db import feed_short
from ..deps import DB, RT
from ..models import Assignment, Feed, FeedBase
from ..schemas import AckIn
from ..sim import live_state, spectrum
from ..sim.timefmt import DAY, hms
from ..sim.world import LIVE_FEED_ID

router = APIRouter(prefix="/feeds", tags=["feeds"])

WATERFALL_ROW_S = 0.25


def get_or_404(session: DB, feed_id: str) -> Feed:
    feed = session.get(Feed, feed_id)
    if feed is None:
        raise HTTPException(status_code=404, detail=f"No feed {feed_id!r}")
    return feed


def known_feed(session: DB, rt: RT, feed_id: str) -> Feed:
    """A stored feed, or the live receiver's feed (built from the receiver settings, never stored)."""
    if feed_id in rt.world.feeds and session.get(Feed, feed_id) is None:
        return rt.world.feeds[feed_id]
    return get_or_404(session, feed_id)


def view(rt: RT, feed_id: str) -> dict[str, Any]:
    return live_state.feed_view(rt.inputs, feed_id, rt.clock.now())


def prepared(body: FeedBase) -> Feed:
    return Feed(**{**body.model_dump(), "short": body.short or feed_short(body.name)})


@router.get("")
def list_feeds(rt: RT) -> list[dict[str, Any]]:
    return [view(rt, fid) for fid in rt.world.feeds]


@router.post("", status_code=201, dependencies=[ADMIN])
def create_feed(body: FeedBase, session: DB, rt: RT) -> dict[str, Any]:
    if session.get(Feed, body.id):
        raise HTTPException(status_code=409, detail=f"Feed {body.id!r} already exists")
    session.add(prepared(body))
    session.commit()
    rt.reload_world()
    return view(rt, body.id)


@router.get("/{feed_id}")
def read_feed(feed_id: str, session: DB, rt: RT) -> dict[str, Any]:
    known_feed(session, rt, feed_id)
    return view(rt, feed_id)


@router.put("/{feed_id}", dependencies=[ADMIN])
def update_feed(feed_id: str, body: FeedBase, session: DB, rt: RT) -> dict[str, Any]:
    get_or_404(session, feed_id)
    if body.id != feed_id:
        raise HTTPException(status_code=422, detail="The body id must match the URL")
    session.merge(prepared(body))
    session.commit()
    rt.reload_world()
    return view(rt, feed_id)


@router.delete("/{feed_id}", status_code=204, dependencies=[ADMIN])
def delete_feed(feed_id: str, session: DB, rt: RT) -> Response:
    feed = get_or_404(session, feed_id)
    session.exec(delete(Assignment).where(col(Assignment.feed_id) == feed_id))
    session.delete(feed)
    session.commit()
    rt.reload_world()
    return Response(status_code=204)


@router.post("/{feed_id}/ack")
async def acknowledge(feed_id: str, session: DB, rt: RT, body: AckIn | None = None) -> dict[str, Any]:
    """Acknowledge the feed's open fault. 409 when it has no unacknowledged fault."""
    get_or_404(session, feed_id)
    if not rt.acknowledge(feed_id, body.reason if body else ""):
        raise HTTPException(status_code=409, detail="This feed has no unacknowledged fault")
    rt.publish_snapshot()
    return view(rt, feed_id)


@router.get("/{feed_id}/health")
def feed_health(feed_id: str, session: DB, rt: RT, minutes: int = Query(60, ge=1, le=1440)) -> dict[str, Any]:
    """The last `minutes` of 1-minute series (oldest first), plus the feed's events, acks and fault spans."""
    known_feed(session, rt, feed_id)
    t = rt.clock.now()
    minute = int(t // 60)
    series = rt.data.feed_series.get(feed_id, {})
    window = [(minute - minutes + 1 + i) % 1440 for i in range(minutes)]
    feed = rt.world.feeds[feed_id]
    return {
        "feed_id": feed_id,
        "minutes": minutes,
        "step_s": 60,
        "end_t": t,
        "series_1m": {
            **{key: [values[i] for i in window] for key, values in series.items()},
            "gain_db": [feed.gain_db] * minutes,
        },
        "events": [
            {"t": ev_t, "clock": hms(ev_t), "state": state, "label": label}
            for ev_t, state, label in rt.health.events.get(feed_id, [])
        ],
        "acks": [{"t": a_t, "clock": hms(a_t), "label": label} for fid, a_t, label in rt.health.acks if fid == feed_id],
        "spans": rt.health.spans(feed_id, t - minutes * 60, t),
    }


@router.get("/{feed_id}/waterfall")
def waterfall(feed_id: str, session: DB, rt: RT, rows: int = Query(120, ge=1, le=600)) -> Response:
    """Backfill for the spectrum watcher: `rows` x 1024 int8 dBFS, oldest first."""
    feed = known_feed(session, rt, feed_id)
    if feed_id == LIVE_FEED_ID or feed_id.startswith("node-"):  # real receivers: an empty (floor) backfill
        body = bytes([0x81]) * (rows * spectrum.BINS)  # int8 -127 dBFS
    else:
        body = spectrum.waterfall(rt.inputs, feed_id, rt.clock.now() % DAY, rows, WATERFALL_ROW_S)
    return Response(
        content=body,
        media_type="application/octet-stream",
        headers={
            "X-Bins": str(spectrum.BINS),
            "X-Row-Seconds": str(WATERFALL_ROW_S),
            "X-Center-MHz": str(feed.center_mhz),
            "X-Span-MHz": str(feed.sample_rate_msps),
        },
    )
