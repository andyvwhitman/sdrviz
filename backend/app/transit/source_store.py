"""Transit sources in the database: seeded once from the defaults, then edited through the API."""

import json

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlmodel import Session, col, select

from ..models import TransitMeta, TransitSourceRow
from .sources import AMTRAK_COMMUTER_ROUTES, DEFAULT_SOURCES, SourceConfig

SEEDED = "sources_seeded"


class SourceStore:
    def __init__(self, engine: Engine):
        self.engine = engine

    def migrate(self) -> None:
        """Add columns newer than the table and backfill the defaults of the sources that exist (once, when added)."""
        with self.engine.begin() as conn:
            columns = {row[1] for row in conn.execute(text("PRAGMA table_info(transit_source)"))}
            if "exclude_routes" not in columns:
                conn.execute(text("ALTER TABLE transit_source ADD COLUMN exclude_routes JSON"))
                conn.execute(
                    text("UPDATE transit_source SET exclude_routes = :routes WHERE id = 'amtrak'"),
                    {"routes": json.dumps(AMTRAK_COMMUTER_ROUTES)},
                )
            if "stale_after_s" not in columns:
                conn.execute(text("ALTER TABLE transit_source ADD COLUMN stale_after_s INTEGER"))
            for source in DEFAULT_SOURCES:  # only where null: a value the user set is kept
                if source.id in ("amtrak", "marc", "vre"):
                    conn.execute(
                        text("UPDATE transit_source SET stale_after_s = :s WHERE id = :id AND stale_after_s IS NULL"),
                        {"s": source.stale_after_s, "id": source.id},
                    )

    def seed_defaults(self) -> bool:
        """Insert the default sources the first time only, so a source the user deletes stays deleted."""
        with Session(self.engine, expire_on_commit=False) as session:
            if session.get(TransitMeta, SEEDED):
                return False
            for position, source in enumerate(DEFAULT_SOURCES):
                session.add(_row(source, position))
            session.add(TransitMeta(key=SEEDED, value="1"))
            session.commit()
            return True

    def load(self) -> list[SourceConfig]:
        with Session(self.engine) as session:
            rows = session.exec(select(TransitSourceRow).order_by(col(TransitSourceRow.position))).all()
            return [SourceConfig.model_validate(row.model_dump(exclude={"position"})) for row in rows]

    def save(self, source: SourceConfig) -> None:
        with Session(self.engine) as session:
            existing = session.get(TransitSourceRow, source.id)
            if existing:
                for key, value in source.model_dump().items():
                    setattr(existing, key, value)
                session.add(existing)
            else:
                last = session.exec(select(TransitSourceRow.position).order_by(col(TransitSourceRow.position).desc()))
                session.add(_row(source, (last.first() or 0) + 1))
            session.commit()

    def delete(self, source_id: str) -> None:
        with Session(self.engine) as session:
            if row := session.get(TransitSourceRow, source_id):
                session.delete(row)
                session.commit()


def _row(source: SourceConfig, position: int) -> TransitSourceRow:
    return TransitSourceRow(**source.model_dump(), position=position)
