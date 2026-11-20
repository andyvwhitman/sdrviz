"""One-shot migration from banks to assignments (decision 66).

    python -m app.migrate_banks --export PATH --bank bank-nec --feed node-1

Writes every bank to the JSON file PATH, makes the frequencies of `--bank` enabled assignments on `--feed`,
relabels the frequencies the waterfall made (`live-chNN`, label `CHNN`) to the AAR number twice ("NNNN"), and
drops the bank table. Run it again and it finds no bank table: it says so and changes nothing.
"""

import argparse
import json
import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlmodel import SQLModel

from .config import Settings
from .db import make_engine
from .models import Assignment


def read_banks(engine: Engine) -> list[dict]:
    """Every bank row as a dict (the table may be gone, then there are none)."""
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT * FROM bank ORDER BY rowid")).mappings().all()
    return [{**row, "frequency_ids": json.loads(row["frequency_ids"] or "[]")} for row in rows]


def has_bank_table(engine: Engine) -> bool:
    with engine.connect() as conn:
        found = conn.execute(text("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'bank'")).first()
    return found is not None


def waterfall_label(aar_channel: int) -> str:
    """The AAR number twice: transmit and receive on the same channel (channel 7 is "0707")."""
    return f"{aar_channel:02d}{aar_channel:02d}"


def migrate(engine: Engine, export: Path, bank_id: str, feed_id: str) -> list[str]:
    """Run the migration; returns what it did, one line each. Raises ValueError for a bank that does not exist."""
    if not has_bank_table(engine):
        return ["no bank table: already migrated, nothing to do"]
    banks = read_banks(engine)
    chosen = next((bank for bank in banks if bank["id"] == bank_id), None)
    if chosen is None:
        raise ValueError(f"no bank {bank_id!r}; the banks are: {', '.join(bank['id'] for bank in banks)}")
    export.parent.mkdir(parents=True, exist_ok=True)
    export.write_text(json.dumps({"banks": banks}, indent=2) + "\n", encoding="utf-8")
    log = [f"exported {len(banks)} banks to {export}"]

    SQLModel.metadata.create_all(engine, tables=[Assignment.__table__])
    with engine.begin() as conn:
        known = set(conn.execute(text("SELECT id FROM frequency")).scalars())
        assigned = [freq_id for freq_id in chosen["frequency_ids"] if freq_id in known]
        for freq_id in assigned:
            conn.execute(
                text("INSERT OR IGNORE INTO assignment (frequency_id, feed_id, enabled) VALUES (:f, :feed, 1)"),
                {"f": freq_id, "feed": feed_id},
            )
        log.append(f"{len(assigned)} frequencies of {bank_id} enabled on {feed_id}")
        if missing := [freq_id for freq_id in chosen["frequency_ids"] if freq_id not in known]:
            log.append(f"not in the frequency table, skipped: {', '.join(missing)}")

        relabelled = 0
        made = conn.execute(text("SELECT id, label, aar_channel FROM frequency WHERE id LIKE 'live-ch%'")).all()
        for freq_id, label, aar_channel in made:
            if label == f"CH{aar_channel:02d}":
                conn.execute(
                    text("UPDATE frequency SET label = :label WHERE id = :id"),
                    {"label": waterfall_label(aar_channel), "id": freq_id},
                )
                relabelled += 1
        log.append(f"{relabelled} waterfall frequencies relabelled")
        conn.execute(text("DROP TABLE bank"))
        log.append("dropped the bank table")
    return log


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Migrate banks to frequency assignments.")
    parser.add_argument("--export", type=Path, required=True, help="JSON file that receives every bank")
    parser.add_argument("--bank", required=True, help="the bank whose frequencies become assignments")
    parser.add_argument("--feed", required=True, help="the feed they are enabled on, e.g. node-1")
    parser.add_argument("--db", type=Path, help="the database file (default: the configured one)")
    args = parser.parse_args(argv)
    engine = make_engine(args.db or Settings().database_file)
    try:
        for line in migrate(engine, args.export, args.bank, args.feed):
            print(line)
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(main())
