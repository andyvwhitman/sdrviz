"""The one-shot banks -> assignments migration, on a copy of a database that still has the bank table."""

import json

from sqlalchemy import text
from sqlmodel import select

from app.config import Settings
from app.db import make_engine, open_session
from app.migrate_banks import main, migrate, waterfall_label
from app.models import Assignment, Frequency

BANKS_DDL = """
CREATE TABLE bank (id VARCHAR PRIMARY KEY, name VARCHAR, description VARCHAR, home_feed VARCHAR, short VARCHAR,
                   sim BOOLEAN, frequency_ids JSON)
"""


def add_banks(engine) -> None:
    """The bank table the old app had, filled from the sim seed."""
    banks = json.loads((Settings().sim_dir / "banks.json").read_text())["banks"]
    with engine.begin() as conn:
        conn.execute(text(BANKS_DDL))
        for bank in banks:
            conn.execute(
                text("INSERT INTO bank VALUES (:id, :name, :description, :home_feed, :short, :sim, :frequency_ids)"),
                {
                    "id": bank["id"],
                    "name": bank["name"],
                    "description": bank.get("description", ""),
                    "home_feed": bank["home_feed"],
                    "short": bank["id"][5:8].upper(),
                    "sim": bank.get("sim", False),
                    "frequency_ids": json.dumps(bank["frequency_ids"]),
                },
            )


def add_waterfall_frequency(db_path) -> None:
    engine = make_engine(db_path)
    add_banks(engine)
    with open_session(engine) as session:
        session.add(
            Frequency(id="live-ch54", label="CH54", freq_mhz=160.92, aar_channel=54, railroad="UNKNOWN", use="live")
        )
        session.commit()
    engine.dispose()


def assignments(engine) -> set[tuple[str, str, bool]]:
    with open_session(engine) as session:
        return {(a.frequency_id, a.feed_id, a.enabled) for a in session.exec(select(Assignment))}


def test_label_is_the_aar_number_twice():
    assert waterfall_label(54) == "5454"
    assert waterfall_label(7) == "0707"


def test_migration_exports_assigns_relabels_and_drops_banks(settings, tmp_path):
    add_waterfall_frequency(settings.db_path)
    engine = make_engine(settings.db_path)
    export = tmp_path / "out" / "banks.json"

    log = migrate(engine, export, "bank-nec", "node-1")

    banks = json.loads(export.read_text())["banks"]
    assert {b["id"] for b in banks} >= {"bank-nec", "bank-freight", "bank-commuter", "bank-harbor"}
    nec = next(b for b in banks if b["id"] == "bank-nec")
    assert isinstance(nec["frequency_ids"], list) and len(nec["frequency_ids"]) == 8
    assert {(f, "node-1", True) for f in nec["frequency_ids"]} <= assignments(engine)
    with open_session(engine) as session:
        assert session.get(Frequency, "live-ch54").label == "5454"
    with engine.connect() as conn:
        assert conn.execute(text("SELECT name FROM sqlite_master WHERE name = 'bank'")).first() is None
    assert any("dropped" in line for line in log)
    engine.dispose()


def test_second_run_is_a_no_op(settings, tmp_path, capsys):
    engine = make_engine(settings.db_path)
    add_banks(engine)
    export = tmp_path / "banks.json"
    migrate(engine, export, "bank-nec", "node-1")
    before, written = assignments(engine), export.read_text()
    export.unlink()

    assert migrate(engine, export, "bank-nec", "node-1") == ["no bank table: already migrated, nothing to do"]

    assert assignments(engine) == before
    assert not export.exists()  # the first export is the one that counts
    assert written
    engine.dispose()


def test_command_line_and_unknown_bank(settings, tmp_path, capsys):
    engine = make_engine(settings.db_path)
    add_banks(engine)
    engine.dispose()
    args = ["--db", str(settings.db_path), "--export", str(tmp_path / "b.json"), "--feed", "node-1"]
    assert main([*args, "--bank", "bank-nope"]) == 1
    assert "no bank 'bank-nope'" in capsys.readouterr().err
    assert main([*args, "--bank", "bank-nec"]) == 0
    assert "exported" in capsys.readouterr().out
    assert main([*args, "--bank", "bank-nec"]) == 0
    assert "already migrated" in capsys.readouterr().out


def test_seed_makes_the_sim_feeds_hears_into_assignments(settings):
    engine = make_engine(settings.db_path)
    with open_session(engine) as session:
        from app.models import Feed

        for feed in session.exec(select(Feed)):
            assert {a[0] for a in assignments(engine) if a[1] == feed.id and a[2]} == set(feed.hears)
    engine.dispose()


def test_a_database_from_before_assignments_gets_them_from_hears(settings):
    from app.db import create_schema

    engine = make_engine(settings.db_path)
    seeded = assignments(engine)
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE assignment"))
    create_schema(engine)
    assert assignments(engine) == seeded
    create_schema(engine)  # once only
    assert assignments(engine) == seeded
    engine.dispose()
