"""Match the app's station places to a feed's stops: nearest by distance, confirmed by name when far."""

import re
from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt

NEAR_M = 250  # this close, distance alone is enough
FAR_M = 1000  # up to here, the names must also share a word
NOISE = {
    "station",
    "rail",
    "marc",
    "vre",
    "amtrak",
    "road",
    "the",
    "of",
    "at",
    "and",
    "sb",
    "nb",
    "eb",
    "wb",
    "w",
    "va",
}


@dataclass(frozen=True)
class Place:
    id: str
    name: str
    lat: float
    lon: float


@dataclass(frozen=True)
class StopPoint:
    id: str
    name: str
    lat: float
    lon: float


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * 6_371_000 * asin(sqrt(a))


def _words(name: str) -> set[str]:
    return set(re.findall(r"[a-z]+", name.lower())) - NOISE


def assign_stops(places: list[Place], stops: list[StopPoint]) -> dict[str, list[str]]:
    """{place id: [stop ids]}. Each stop belongs to its nearest place, if that place plausibly is the stop."""
    mapping: dict[str, list[str]] = {}
    for stop in stops:
        place, dist = min(
            ((p, distance_m(stop.lat, stop.lon, p.lat, p.lon)) for p in places),
            key=lambda pair: pair[1],
            default=(None, 0),
        )
        if place is None or dist > FAR_M:
            continue
        if dist > NEAR_M and not _words(stop.name) & _words(place.name):
            continue
        mapping.setdefault(place.id, []).append(stop.id)
    return mapping
