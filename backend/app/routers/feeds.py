from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response
from sqlmodel import select

from ..db import feed_short
from ..deps import DB, RT
from ..models import Bank, Feed, FeedBase
from ..schemas import AckIn
from ..sim import live_state, spectrum
from ..sim.timefmt import DAY, hms

router = APIRouter(prefix="/feeds", tags=["feeds"])

WATERFALL_ROW_S = 0.25


def get_or_404(session: DB, feed_id: str) -> Feed:
    feed = session.get(Feed, feed_id)
    if feed is None:
        raise HTTPException(status_code=404, detail=f"No feed {feed_id!r}")
    return feed


def view(rt: RT, feed_id: str) -> dict[str, Any]:
    return live_state.feed_view(rt.inputs, feed_id, rt.clock.now())


def prepared(body: FeedBase) -> Feed:
    return Feed(**{**body.model_dump(), "short": body.short or feed_short(body.name)})


@router.get("")
def list_feeds(rt: RT) -> list[dict[str, Any]]:
    return [view(rt, fid) for fid in rt.world.feeds]


@router.post("", status_code=201)
def create_feed(body: FeedBase, session: DB, rt: RT) -> dict[str, Any]:
    if session.get(Feed, body.id):
        raise HTTPException(status_code=409, detail=f"Feed {body.id!r} already exists")
    session.add(prepared(body))
    session.commit()
    rt.reload_world()
    return view(rt, body.id)


@router.get("/{feed_id}")
def read_feed(feed_id: str, session: DB, rt: RT) -> dict[str, Any]:
    get_or_404(session, feed_id)
    return view(rt, feed_id)


@router.put("/{feed_id}")
def update_feed(feed_id: str, body: FeedBase, session: DB, rt: RT) -> dict[str, Any]:
    get_or_404(session, feed_id)
    if body.id != feed_id:
        raise HTTPException(status_code=422, detail="The body id must match the URL")
    session.merge(prepared(body))
    session.commit()
    rt.reload_world()
    return view(rt, feed_id)


@router.delete("/{feed_id}", status_code=204)
def delete_feed(feed_id: str, session: DB, rt: RT) -> Response:
    feed = get_or_404(session, feed_id)
    homes = [b.id for b in session.exec(select(Bank)).all() if b.home_feed == feed_id]
    if homes:
        raise HTTPException(status_code=409, detail=f"Home feed of bank(s) {', '.join(homes)}")
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
    get_or_404(session, feed_id)
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
    feed = get_or_404(session, feed_id)
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
