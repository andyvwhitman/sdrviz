"""Database engine, schema and the first-run seed.

python -m app.db reset     # drop everything and re-seed from data/seed and data/sim
"""

import json
import sys
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import event, inspect, text
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine, select

from .config import Settings
from .models import Assignment, Feed, FeedAck, FeedEvent, Frequency, Prefs, Transmission
from .nodes import models as _node_tables  # noqa: F401  (registers the node tables for create_all)
from .recordings import models as _recording_tables  # noqa: F401  (registers the recording table)
from .sim.detector import detector_fields
from .sim.timefmt import iso_from_offset

FTS_DDL = """
CREATE VIRTUAL TABLE IF NOT EXISTS transmission_fts
USING fts5(tx_id UNINDEXED, transcript, speaker, train_id)
"""


def feed_short(name: str) -> str:
    return name.split()[0]


def make_engine(path: Path) -> Engine:
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _pragmas(dbapi_connection, _record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

    return engine


def open_session(engine: Engine) -> Session:
    # Rows read for the live world stay usable after the session closes.
    return Session(engine, expire_on_commit=False)


def session_scope(engine: Engine) -> Iterator[Session]:
    with open_session(engine) as session:
        yield session


def create_schema(engine: Engine) -> None:
    first_assignments = not inspect(engine).has_table(Assignment.__tablename__)
    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(text(FTS_DDL))
    if first_assignments:
        _assign_from_hears(engine)
    _add_recording_node_id(engine)
    _drop_old_prefs_columns(engine)


def _drop_old_prefs_columns(engine: Engine) -> None:
    """Preferences from before banks went lose `active_bank` and `displayed_feed`. `listen_feed` (the node listened to
    is each client's own now) stays in old databases as a nullable column nothing reads or writes."""
    with engine.begin() as conn:
        columns = {row[1] for row in conn.execute(text("PRAGMA table_info(prefs)"))}
        for old in ("active_bank", "displayed_feed"):
            if old in columns:
                conn.execute(text(f"ALTER TABLE prefs DROP COLUMN {old}"))


def _add_recording_node_id(engine: Engine) -> None:
    """Recordings carry the node that heard them; older rows of a node feed (`node-N`) get it from the node's number."""
    with engine.begin() as conn:
        columns = {row[1] for row in conn.execute(text("PRAGMA table_info(recording)"))}
        if "node_id" not in columns:
            conn.execute(text("ALTER TABLE recording ADD COLUMN node_id VARCHAR"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_recording_node_id ON recording (node_id)"))
            conn.execute(
                text(
                    "UPDATE recording SET node_id = (SELECT node.id FROM node WHERE 'node-' || node.number = "
                    "recording.feed_id) WHERE feed_id LIKE 'node-%'"
                )
            )


def _assign_from_hears(engine: Engine) -> None:
    """A database from before assignments: what each feed heard becomes its enabled assignments (once)."""
    with open_session(engine) as session:
        for feed in session.exec(select(Feed)):
            session.add_all(Assignment(frequency_id=freq_id, feed_id=feed.id) for freq_id in feed.hears)
        session.commit()


def _read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def seed_if_empty(engine: Engine, settings: Settings) -> bool:
    """Fill an empty database from the seed and sim files. Returns True when it seeded."""
    with open_session(engine) as session:
        if session.exec(select(Frequency).limit(1)).first():
            return False
        seed_all(session, settings)
    return True


def seed_all(session: Session, settings: Settings) -> None:
    places = _read(settings.seed_dir / "places.json")
    health = _read(settings.sim_dir / "health.json")
    transmissions = _read(settings.sim_dir / "transmissions.json")

    freqs = {f["id"]: f for f in _read(settings.seed_dir / "frequencies.json")["frequencies"]}
    for freq in freqs.values():
        session.add(Frequency(**freq))

    for place in places["feeds"]:
        static = health["feeds"][place["id"]]
        short = feed_short(place["name"])
        session.add(
            Feed(
                id=place["id"],
                name=place["name"],
                short=short,
                site=place["site"],
                lat=place["lat"],
                lon=place["lon"],
                coverage_radius_km=place["coverage_radius_km"],
                hears=place["hears"],
                driver=static["driver"],
                driver_sim=static.get("driver_sim", False),
                host=f"{short.lower()}.sim.local",
                port=7373 if static["driver"] == "sdrviz-agent" else 1234,
                center_mhz=static["center_mhz"],
                sample_rate_msps=static["sample_rate_msps"],
                gain_db=static["gain_db"],
                ppm=static["ppm"],
                noise_floor_dbfs=static["noise_floor_dbfs"],
                sim=True,
            )
        )
        session.add_all(Assignment(frequency_id=freq_id, feed_id=place["id"]) for freq_id in place["hears"])
        for ev in static["events"]:
            session.add(FeedEvent(feed_id=place["id"], t=ev["t"], state=ev["state"], label=ev["label"]))
        for ack in static["acks"]:
            session.add(FeedAck(feed_id=place["id"], t=ack["t"], label=ack["label"], source="sim"))

    place_by_id = {p["id"]: p for group in ("stations", "landmarks", "detectors") for p in places[group]}
    rows = [{**tx, "kind": "tx"} for tx in transmissions["transmissions"]]
    rows += [{**kc, "kind": "kerchunk"} for kc in transmissions["kerchunks"]]
    for row in rows:
        session.add(_transmission(row, freqs[row["frequency_id"]], place_by_id))
        session.flush()
        if row["kind"] == "tx":
            session.execute(
                text("INSERT INTO transmission_fts (tx_id, transcript, speaker, train_id) VALUES (:i, :t, :s, :r)"),
                {
                    "i": row["id"],
                    "t": row["transcript"],
                    "s": row.get("speaker") or "",
                    "r": row.get("train_id") or "",
                },
            )

    session.add(Prefs())
    session.commit()


def _transmission(row: dict, freq: dict, places: dict[str, dict]) -> Transmission:
    """A Transmission table row from a data/sim record (a transmission or a kerchunk)."""
    transcript = row.get("transcript", "")
    role = row.get("speaker_role")
    return Transmission(
        id=row["id"],
        kind=row["kind"],
        t_offset_s=row["t_offset_s"],
        started_at=iso_from_offset(row["t_offset_s"]),
        frequency_id=row["frequency_id"],
        aar_channel=freq["aar_channel"],
        freq_mhz=freq["freq_mhz"],
        feed_id=row["feed_id"],
        speaker_role=role,
        speaker=row.get("speaker"),
        duration_s=row["duration_s"],
        train_id=row.get("train_id"),
        place_id=row.get("place_id"),
        transcript=transcript,
        transcript_state=row.get("transcript_state", "carrier_only"),
        confidence=row.get("confidence"),
        decode_latency_s=row.get("decode_latency_s", 0.0),
        words=row.get("words", []),
        receptions=row.get("receptions", []),
        detector=detector_fields(role, transcript, places.get(row.get("place_id") or "")) if role else None,
        source=row.get("source", "SIM"),
        sim=row.get("sim", True),
    )


def reset(engine: Engine, settings: Settings) -> None:
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS transmission_fts"))
    SQLModel.metadata.drop_all(engine)
    create_schema(engine)
    seed_if_empty(engine, settings)


if __name__ == "__main__":
    config = Settings()
    db_engine = make_engine(config.database_file)
    if sys.argv[1:] == ["reset"]:
        reset(db_engine, config)
        print(f"re-seeded {config.database_file}")
    else:
        create_schema(db_engine)
        print("seeded" if seed_if_empty(db_engine, config) else "already seeded", config.database_file)
