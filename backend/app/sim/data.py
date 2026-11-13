"""Everything the replay reads that does not change at runtime, loaded once at startup."""

import json
from dataclasses import dataclass

from sqlalchemy.engine import Engine
from sqlmodel import select

from ..config import Settings
from ..db import open_session
from ..models import FeedAck, FeedEvent, Transmission
from .day import SimDay
from .health import Health
from .trains import TrainRun, load_runs
from .types import Tx
from .world import load_routes


@dataclass
class SimData:
    day: SimDay
    kerchunks: list[dict]
    runs: list[TrainRun]
    train_records: list[dict]  # trains.json records, as served by GET /trains
    feed_series: dict[str, dict[str, list]]  # health.json series_1m by feed id
    system_series: dict[str, dict[str, list]]  # health.json host / decoder / disk series (5 min steps)


def tx_from_row(row: Transmission) -> Tx:
    return Tx(
        id=row.id,
        t=row.t_offset_s,
        duration=row.duration_s,
        channel=row.frequency_id,
        role=row.speaker_role or "unknown",
        speaker=row.speaker,
        text=row.transcript,
        place_id=row.place_id,
        train_id=row.train_id,
        state=row.transcript_state,
        sim=row.sim,
        receptions=tuple(row.receptions),
        words=tuple(row.words),
        confidence=row.confidence,
        latency=row.decode_latency_s,
        detector=row.detector,
    )


def load_sim_data(engine: Engine, settings: Settings) -> SimData:
    with open_session(engine) as session:
        rows = session.exec(select(Transmission)).all()
        tx_rows = [tx_from_row(r) for r in rows if r.kind == "tx"]
        kerchunks = [
            {
                "id": r.id,
                "t_offset_s": r.t_offset_s,
                "frequency_id": r.frequency_id,
                "feed_id": r.feed_id,
                "duration_s": r.duration_s,
            }
            for r in rows
            if r.kind == "kerchunk"
        ]
    trains = json.loads((settings.sim_dir / "trains.json").read_text(encoding="utf-8"))["trains"]
    health = json.loads((settings.sim_dir / "health.json").read_text(encoding="utf-8"))
    return SimData(
        day=SimDay(tx_rows),
        kerchunks=kerchunks,
        runs=load_runs(trains, load_routes(settings)),
        train_records=trains,
        feed_series={fid: feed["series_1m"] for fid, feed in health["feeds"].items()},
        system_series=health["system"],
    )


def load_health(engine: Engine) -> Health:
    with open_session(engine) as session:
        events: dict[str, list[tuple[float, str, str]]] = {}
        for ev in session.exec(select(FeedEvent).order_by(FeedEvent.t)).all():
            events.setdefault(ev.feed_id, []).append((ev.t, ev.state, ev.label))
        acks = [(a.feed_id, a.t, a.label) for a in session.exec(select(FeedAck)).all()]
    return Health(events, acks)
