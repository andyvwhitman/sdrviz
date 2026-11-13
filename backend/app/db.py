"""Database engine, schema and the first-run seed.

python -m app.db reset     # drop everything and re-seed from data/seed and data/sim
"""

import json
import sys
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import event, text
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine, select

from .config import Settings
from .models import Bank, Feed, FeedAck, FeedEvent, Frequency, Prefs, Transmission
from .sim.detector import detector_fields
from .sim.timefmt import iso_from_offset

FTS_DDL = """
CREATE VIRTUAL TABLE IF NOT EXISTS transmission_fts
USING fts5(tx_id UNINDEXED, transcript, speaker, train_id)
"""

BANK_SHORTS = {"bank-nec": "NEC", "bank-freight": "FRT", "bank-commuter": "COM", "bank-harbor": "HBR"}


def bank_short(bank_id: str, name: str) -> str:
    """Bank short code (spec gap 13.4.5): known ids first, otherwise the first three letters."""
    return BANK_SHORTS.get(bank_id) or name[:3].upper()


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
    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(text(FTS_DDL))


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
    banks = _read(settings.sim_dir / "banks.json")["banks"]
    transmissions = _read(settings.sim_dir / "transmissions.json")

    freqs = {f["id"]: f for f in _read(settings.seed_dir / "frequencies.json")["frequencies"]}
    for freq in freqs.values():
        session.add(Frequency(**freq))

    for bank in banks:
        short = bank_short(bank["id"], bank["name"])
        session.add(Bank(**{**bank, "short": short}))

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
