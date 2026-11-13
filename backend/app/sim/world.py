"""The world the replay runs in: frequencies, banks and feeds (from the database), places and routes."""

import json
from dataclasses import dataclass, field

from sqlalchemy import literal_column
from sqlalchemy.engine import Engine
from sqlmodel import select

from ..config import Settings
from ..db import open_session
from ..models import Bank, Feed, Frequency


@dataclass
class World:
    freqs: dict[str, Frequency]
    banks: list[Bank]
    feeds: dict[str, Feed]
    places: dict[str, dict]  # seed places by id (stations, landmarks, detectors, feeds)
    routes: dict[str, dict]  # data/sim/routes.json by route id
    _heard_by: dict[str, list[str]] = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._heard_by = {cid: [fid for fid, feed in self.feeds.items() if cid in feed.hears] for cid in self.freqs}

    @property
    def monitored(self) -> list[str]:
        return [cid for cid, feeds in self._heard_by.items() if feeds]

    def heard_by(self, channel: str) -> list[str]:
        return self._heard_by.get(channel, [])

    def banks_of(self, channel: str) -> list[str]:
        return [b.id for b in self.banks if channel in b.frequency_ids]

    def bank(self, bank_id: str) -> Bank:
        return next(b for b in self.banks if b.id == bank_id)

    def has_bank(self, bank_id: str) -> bool:
        return any(b.id == bank_id for b in self.banks)

    def feed_short(self, feed_id: str) -> str:
        feed = self.feeds.get(feed_id)
        return feed.short if feed else feed_id


def load_world(engine: Engine, settings: Settings) -> World:
    """Read the editable resources from the database, in insertion order."""
    with open_session(engine) as session:

        def table(model):
            return session.exec(select(model).order_by(literal_column("rowid"))).all()

        freqs = {f.id: f for f in table(Frequency)}
        banks = list(table(Bank))
        feeds = {f.id: f for f in table(Feed)}
    return World(freqs, banks, feeds, load_places(settings), load_routes(settings))


def load_places(settings: Settings) -> dict[str, dict]:
    raw = json.loads((settings.seed_dir / "places.json").read_text(encoding="utf-8"))
    return {p["id"]: p for group in ("stations", "landmarks", "detectors", "feeds") for p in raw[group]}


def load_routes(settings: Settings) -> dict[str, dict]:
    raw = json.loads((settings.sim_dir / "routes.json").read_text(encoding="utf-8"))
    return {route["id"]: route for route in raw["routes"]}
