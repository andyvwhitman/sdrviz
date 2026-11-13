#!/usr/bin/env python3
"""gen_sim.py - deterministic mockup fixtures for sdrviz (``data/sim/``).

README
======

What it does
------------
Reads the researched seed in ``data/seed/`` (read-only) and writes one
simulated weekday of corridor radio to ``data/sim/``. The mockups (Stage 2)
and the fake backend (Stage 3, decision #1) both replay these files as-is, so
every number on a screen can be traced to them (brief P3, section 9.0.6).

Run it
------
    uv run python tools/gen_sim.py      # or: python3 tools/gen_sim.py

Standard library only. Fixed seed 1919: two runs give byte-identical output.
The script validates its own output and exits non-zero if a check fails.

Outputs (``data/sim/``)
-----------------------
routes.json          The five CTC / stringline routes (brief 9.0.4) with native
                     mileposts. Values not in the seed are derived from
                     geometry and flagged ``mp_approx`` (shown as ``≈``).
banks.json           Seed banks plus the director-added Baltimore Harbor bank,
                     with home feeds (brief 9.1.2, 9.4).
trains.json          Dummy schedule for passenger trains only (Amtrak, MARC,
                     VRE; freight is never positioned). Every seed row that names
                     a passenger train lines up with that train's run.
transmissions.json   The seed rows verbatim (``sim: false``) plus SIM rows
                     (``sim: true``, ``source: "SIM"``). Every row gains
                     ``receptions[]``, ``train_id``, ``place_id``,
                     ``transcript_state``, ``confidence``, ``words[]`` and
                     ``decode_latency_s``. Kerchunks (< 250 ms, no row) are
                     listed separately under ``kerchunks``.
stats.json           Per-channel stats for the day: counts and airtime per hour,
                     airtime per 10 min, busy hours, average duration, last
                     heard; plus the density checks.
health.json          Feed state events and 1-minute series for the four
                     fictional feeds, plus host, decoder and disk series.
day.js               All of the above as ``window.SDRVIZ_DAY`` for file:// pages.
scenarios/<name>.json and .js
                     Self-contained snapshots of everything a screen shows at
                     one instant. The .js file assigns
                     ``window.SDRVIZ_SCENARIOS["<name>"]`` so a file:// mockup
                     can load it with a <script> tag.

Scenarios
---------
listening    03:40:00  Nothing keyed. Active bank NEC: last key-up 42 min ago
                       on CH54 (Amtrak 65, Martin State).
fault        14:06:22  BAY-04 STALE (since 14:05:10, 1M 12S) and LND-02
                       FAULT · LINK LOST (since 14:06:00), unacknowledged.
fault-acked  14:06:36  The same, after LND-02 was acknowledged at 14:06:31.
keyed        14:07:30  CH54 (MARC 433 at Odenton, 00:07.4 elapsed) + CH08 (CSX
                       crew) + off-bank CH66 (CSX BE desk) transmitting. Active
                       bank Commuter. Both feeds have recovered (14:06:48 and
                       14:06:58), so one day's timeline holds every scenario.
system       03:40:00  Not a snapshot: system-state moments for system.html on
                       top of "listening" (first-data wait 6 s, link drop at 9 s
                       and 22 s, backoff 1/2/4/8 s, an empty New Bank).

Each snapshot's ``header.feeds_hero`` ranks feeds unacked fault > acked fault
> offline > stale (``header.feeds_hero_ranked``), and ``displayed_feed_admin``
names the feed the Feeds & Banks inspector opens on, with the reason.

Conventions
-----------
* Times are seconds from local midnight, EST (UTC-05:00), on SIM_DATE.
* The SIM day repeats: "yesterday" is this day shifted by -24 h, which is how
  rolling-24 h ranges and trains that run past midnight are resolved.
* Police channels do not exist (decision #13). Only channels in
  ``data/seed/frequencies.json`` are used, and only monitored ones get traffic.
"""

from __future__ import annotations

import bisect
import functools
import json
import math
import random
import re
import statistics
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field, replace
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED_DIR = ROOT / "data" / "seed"
SIM_DIR = ROOT / "data" / "sim"

SEED = 1919
DAY = 86_400
SIM_DATE = "2026-11-10"  # a Tuesday; EST (DST ended 2026-11-01)
TZ = {"name": "EST", "iana": "America/New_York", "utc_offset": "-05:00"}

GUARD_S = 1.0             # minimum gap between two key-ups on one channel
VOICE_REACH = 1.25        # voice heard out to 1.25 x the feed's coverage radius
DETECTOR_REACH = 1.7      # wayside detectors are elevated and loud
CHANNEL_RANGES = {"recent": 120, "recent-dim": 600}   # brief 7.3 "Cool"

RUSH_HOURS = set(range(5, 9)) | set(range(15, 19))     # 05-09 and 15-19
NIGHT_HOURS = set(range(0, 4))                         # 00-04
MIDDAY_HOURS = set(range(10, 14))                      # comparison window

ROLE_TAGS = {
    "crew": "CRW", "dispatcher": "DSP", "operator": "OPR", "detector": "DET",
    "yardmaster": "YDM", "MOW": "MOW", "unknown": "UNK",
}
HOME_FEEDS = {
    "bank-nec": "feed-lnd", "bank-freight": "feed-bay",
    "bank-commuter": "feed-lnd", "bank-harbor": "feed-bay",
}
HARBOR_BANK = {
    "id": "bank-harbor",
    "name": "Baltimore Harbor",
    "description": "Director-added view (brief 9.4): Canton, Tradepoint, Curtis Bay, "
                   "Locust Point, the Bayviews, coal pier and Seawall.",
    "frequency_ids": ["canton-1", "tpr-road", "tpr-mow", "csx-curtis-bay", "csx-locust-pt",
                      "csx-bayview", "ns-bayview", "csx-coal-pier", "csx-ind-switch"],
    "sim": True,
}


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------

def clock(text: str) -> float:
    """'HH:MM', 'HH:MM:SS' or 'HH:MM:SS.s' -> seconds after midnight."""
    parts = [float(p) for p in text.split(":")]
    while len(parts) < 3:
        parts.append(0.0)
    h, m, s = parts
    return h * 3600 + m * 60 + s


def hms(t: float, tenths: bool = False) -> str:
    t %= DAY
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    if tenths:
        s = round(s, 1)
        if s >= 60:  # rounding carried into the next minute
            return hms(math.floor(t) + 1 - (t % 1), tenths=True)
        return f"{int(h):02d}:{int(m):02d}:{s:04.1f}"
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d}"


def age_label(seconds: float, form: str = "last") -> str:
    """Compact instrument age (brief §4), identical to HUD.fmt.age in design/mockups/_shared/hud.js.

    LAST / SINCE form: 48S, 4M, 1H 12M, 2D 3H (seconds only under 60 s).
    AGE form (form="age"): as above, but keeps seconds under 10 min: 1M 12S.
    """
    s = max(0, int(seconds))
    if s < 60:
        return f"{s}S"
    if s < 3600:
        if form == "age" and s < 600:
            return f"{s // 60}M {s % 60}S"
        return f"{s // 60}M"
    if s < 86400:
        return f"{s // 3600}H {(s % 3600) // 60}M"
    return f"{s // 86400}D {(s % 86400) // 3600}H"


def aired(tx: "Tx", end: float) -> float:
    """Seconds of ``tx`` on the air by ``end``: a key-up still live at ``end`` counts only its elapsed time."""
    return max(0.0, min(tx.duration, end - tx.t))


def total_label(seconds: float) -> str:
    """Airtime totals are always HH:MM:SS (brief 4), rounding the total first so a label never reads :60.

    The one total formatter; HUD.fmt.total in design/mockups/_shared/hud.js matches it.
    Single-clip durations are MM:SS.s and are formatted on screen, not here.
    """
    s = int(round(seconds))
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


def km_between(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def miles_between(a: tuple[float, float], b: tuple[float, float]) -> float:
    return km_between(a, b) / 1.609344


def mp_text(prefix: str | None, mp: float | None, approx: bool) -> str | None:
    if prefix is None or mp is None:
        return None
    return f"{'≈' if approx else ''}{prefix} {mp:.1f}"


def aar4(channel: int) -> str:
    return f"{channel:02d}{channel:02d}"


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def write_js(path: Path, target: str, data, prelude: str = "") -> None:
    """A file:// page can load this with a <script> tag (fetch is blocked on file://)."""
    body = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    path.write_text(f"{prelude}{target} = {body};\n", encoding="utf-8")


# --------------------------------------------------------------------------
# Seed
# --------------------------------------------------------------------------

# Signal and control-point names used in the seed transcripts but absent from
# places.json. Coordinates are estimates for the mockup, not sourced.
DERIVED_POINTS = {
    "sig-van-dorn": ("Van Dorn", 38.7993, -77.1290),
    "sig-af": ("AF", 38.8030, -77.0680),
    "sig-slaters-lane": ("Slaters Lane", 38.8222, -77.0455),
    "sig-ro": ("RO", 38.8665, -77.0445),
    "sig-cr-tower": ("CR Tower", 38.8068, -77.0740),
    "sig-edsall": ("Edsall", 38.8075, -77.1380),
    "sig-springfield": ("Springfield", 38.8000, -77.1620),
    "sig-riverdale": ("Riverdale", 38.9606, -76.9142),
    "sig-hb": ("HB", 39.2800, -76.6230),
    "pt-canton": ("Canton", 39.2770, -76.5690),
}

# Spoken names, used to write SIM transcripts and to find places in seed text.
SAY = {
    "wash-union": "Union Station", "lenfant": "L'Enfant", "crystal-city": "Crystal City",
    "alexandria": "Alexandria", "franconia-spfld": "Franconia", "lorton": "Lorton",
    "woodbridge": "Woodbridge", "rippon": "Rippon", "quantico": "Quantico",
    "backlick": "Backlick", "burke-centre": "Burke", "manassas": "Manassas",
    "new-carrollton": "New Carrollton", "seabrook": "Seabrook", "bowie-state": "Bowie",
    "odenton": "Odenton", "bwi": "BWI", "halethorpe": "Halethorpe",
    "west-baltimore": "West Baltimore", "baltimore-penn": "Penn Station",
    "martin-state": "Martin State", "edgewood": "Edgewood", "aberdeen": "Aberdeen",
    "perryville": "Perryville", "college-park": "College Park", "greenbelt": "Greenbelt",
    "muirkirk": "Muirkirk", "laurel": "Laurel", "savage": "Savage", "jessup": "Jessup",
    "dorsey": "Dorsey", "st-denis": "St. Denis", "camden": "Camden",
    "silver-spring": "Silver Spring", "kensington": "Kensington", "rockville": "Rockville",
    "gaithersburg": "Gaithersburg", "ivy-city": "Ivy City", "benning-yd": "Benning",
    "potomac-yard": "Potomac Yard", "long-bridge": "Long Bridge",
    "va-ave-tunnel": "Virginia Avenue", "landover-int": "Landover",
    "b-p-tunnel": "the B&P tunnel", "union-tunnel": "Union Tunnel",
    "howard-st-tunnel": "Howard Street", "mt-clare": "Mount Clare",
    "locust-point": "Locust Point", "curtis-bay": "Curtis Bay",
    "sparrows-point": "Sparrows Point", "gunpowder-br": "Gunpowder bridge",
    "lorton-auto-train": "the Auto Train terminal", "bayview-yd": "Bayview",
    "jessup-yd": "Jessup", "det-hyattsville": "Hyattsville", "det-newington": "Newington",
    "det-neabsco": "Neabsco", "det-white-marsh": "White Marsh", "det-waverly": "Waverly",
    "det-belcamp": "Belcamp", "det-ilchester": "Ilchester",
    **{pid: name for pid, (name, _, _) in DERIVED_POINTS.items()},
}
EXTRA_ALIASES = {
    "Baltimore": "baltimore-penn", "Washington Terminal": "wash-union",
    "Gunpowder": "gunpowder-br", "Burke": "burke-centre", "Clinton Street": "pt-canton",
    "the pier": "sparrows-point", "Pohick": "lorton", "Penn Station": "baltimore-penn",
}

# Where a channel's talkers are when the text names no place.
CHANNEL_HOME = {
    "amtk-wash-term": "wash-union", "amtk-k-tower": "wash-union", "amtk-wash-ops2": "wash-union",
    "amtk-ivy-city": "ivy-city", "amtk-mow-27": "bowie-state", "amtk-auto-train": "lorton-auto-train",
    "csx-jessup": "jessup-yd", "csx-benning": "benning-yd", "csx-bayview": "bayview-yd",
    "ns-bayview": "bayview-yd", "csx-locust-pt": "locust-point", "csx-curtis-bay": "curtis-bay",
    "csx-ind-switch": "curtis-bay", "canton-1": "pt-canton", "tpr-road": "sparrows-point",
    "tpr-mow": "sparrows-point", "csx-landover": "landover-int", "csx-ni-disp": "landover-int",
    "csx-mow": "lorton", "ns-mow": "burke-centre", "csx-be-disp": "bayview-yd",
    "csx-bd-disp": "alexandria", "ns-hag-disp": "backlick", "csx-bc-disp": "college-park",
}


@dataclass
class World:
    freqs: dict[str, dict]
    banks: list[dict]
    places: dict[str, dict]
    feeds: dict[str, dict]
    seed_rows: list[dict]
    routes: dict[str, dict] = field(default_factory=dict)

    @property
    def monitored(self) -> list[str]:
        heard = {c for f in self.feeds.values() for c in f["hears"]}
        return [cid for cid in self.freqs if cid in heard]

    def heard_by(self, channel: str) -> list[str]:
        return [fid for fid, f in self.feeds.items() if channel in f["hears"]]

    def loc(self, place_id: str) -> tuple[float, float]:
        p = self.places[place_id]
        return p["lat"], p["lon"]

    def banks_of(self, channel: str) -> list[str]:
        return [b["id"] for b in self.banks if channel in b["frequency_ids"]]

    def bank(self, bank_id: str) -> dict:
        return next(b for b in self.banks if b["id"] == bank_id)


def feed_short(feed: dict) -> str:
    return feed["name"].split()[0]


def load_world() -> World:
    def read(name: str) -> dict:
        return json.loads((SEED_DIR / name).read_text(encoding="utf-8"))

    freqs = {f["id"]: f for f in read("frequencies.json")["frequencies"]}
    banks = read("banks.json")["banks"] + [HARBOR_BANK]
    for bank in banks:
        bank["home_feed"] = HOME_FEEDS[bank["id"]]
    raw = read("places.json")
    places: dict[str, dict] = {}
    for group in ("stations", "landmarks", "detectors", "feeds"):
        for p in raw[group]:
            places[p["id"]] = p
    for pid, (name, lat, lon) in DERIVED_POINTS.items():
        places[pid] = {
            "id": pid, "name": name, "kind": "signal" if pid.startswith("sig-") else "area",
            "lat": lat, "lon": lon, "derived": True, "sim": True,
            "note": "Named in seed transcripts; coordinate estimated for the mockup, not sourced.",
        }
    for p in raw["detectors"]:
        SAY.setdefault(p["id"], p["name"].replace(" defect detector", ""))
    feeds = {p["id"]: p for p in raw["feeds"]}
    seed_rows = read("transmissions.json")["transmissions"]
    return World(freqs, banks, places, feeds, seed_rows)


# --------------------------------------------------------------------------
# Routes (brief 9.0.4)
# --------------------------------------------------------------------------

ROUTE_DEFS = [
    {"id": "r-nec", "name": "NEC · RF&P", "segments": [
        {"prefix": "CFP", "rising": True, "points": [
            ("quantico", 78.9), ("det-neabsco", 84.6), ("rippon", None), ("woodbridge", 88.9),
            ("lorton-auto-train", None), ("lorton", 93.0), ("det-newington", 95.8),
            ("franconia-spfld", None), ("sig-van-dorn", None), ("sig-af", None),
            ("alexandria", 105.1), ("sig-slaters-lane", None), ("potomac-yard", None),
            ("crystal-city", None), ("sig-ro", None), ("long-bridge", None), ("lenfant", None),
            ("wash-union", None)]},
        {"prefix": "NEC", "rising": False, "points": [
            ("wash-union", 135.7), ("landover-int", 128.8), ("new-carrollton", 127.0),
            ("seabrook", 124.7), ("bowie-state", 119.4), ("odenton", 113.6), ("bwi", 106.3),
            ("halethorpe", 103.0), ("west-baltimore", 98.5), ("b-p-tunnel", None),
            ("baltimore-penn", 95.7), ("union-tunnel", None), ("martin-state", 84.0),
            ("gunpowder-br", 78.9), ("edgewood", 75.1), ("aberdeen", 65.5), ("perryville", 59.5)]},
    ]},
    {"id": "r-capital", "name": "CSX CAPITAL SUB", "segments": [
        {"prefix": "BAA", "rising": False, "points": [
            ("wash-union", None), ("det-hyattsville", 33.7), ("sig-riverdale", None),
            ("college-park", None), ("greenbelt", None), ("muirkirk", None), ("det-laurel", 21.7),
            ("laurel", None), ("savage", None), ("jessup-yd", 17.0), ("jessup", None),
            ("dorsey", None), ("det-st-denis", 6.7), ("st-denis", None), ("camden", None)]},
    ]},
    {"id": "r-metro", "name": "CSX METROPOLITAN SUB", "segments": [
        {"prefix": "BA", "rising": True, "points": [
            ("wash-union", None), ("silver-spring", None), ("kensington", None),
            ("det-kensington", 11.6), ("rockville", None), ("gaithersburg", None),
            ("det-gaithersburg", 22.6)]},
    ]},
    {"id": "r-manassas", "name": "NS · VRE MANASSAS", "segments": [
        {"prefix": None, "rising": True, "points": [
            ("manassas", None), ("burke-centre", None), ("backlick", None),
            ("sig-springfield", None), ("sig-edsall", None), ("sig-cr-tower", None),
            ("alexandria", None)]},
    ]},
    {"id": "r-phila", "name": "CSX PHILADELPHIA SUB", "segments": [
        {"prefix": "BAK", "rising": False, "points": [
            ("det-waverly", 92.3), ("bayview-yd", 89.6), ("det-white-marsh", 80.4),
            ("det-belcamp", 68.2)]},
    ]},
]

# Road and dispatcher channel by milepost prefix (brief 9.0.4 main users).
ROAD_CHANNEL = {"CFP": "csx-rfp-road", "NEC": "amtk-nec-road", "BAA": "csx-road",
                "BA": "csx-road", None: "ns-road", "BAK": "csx-road"}
DISPATCH = {
    "CFP": ("csx-bd-disp", "BD", "CSX BD dispatcher"),
    "NEC": ("amtk-nec-road", "dispatcher", "Amtrak dispatcher"),
    "BAA": ("csx-bc-disp", "BC", "CSX BC dispatcher"),
    "BA": ("csx-bc-disp", "BC", "CSX BC dispatcher"),
    None: ("ns-hag-disp", "Hagerstown", "NS Hagerstown dispatcher"),
}


def fill_mileposts(seg: dict, world: World) -> list[dict]:
    """Native mileposts for one segment; gaps interpolated or extrapolated by distance."""
    ids = [pid for pid, _ in seg["points"]]
    known = {i: mp for i, (_, mp) in enumerate(seg["points"]) if mp is not None}
    cum = [0.0]
    for a, b in zip(ids, ids[1:]):
        cum.append(cum[-1] + miles_between(world.loc(a), world.loc(b)))
    sign = 1 if seg["rising"] else -1
    out = []
    for i, pid in enumerate(ids):
        mp, approx = known.get(i), False
        if mp is None and known and seg["prefix"]:
            approx = True
            before = [k for k in known if k < i]
            after = [k for k in known if k > i]
            if before and after:
                a, b = before[-1], after[0]
                frac = (cum[i] - cum[a]) / (cum[b] - cum[a])
                mp = known[a] + (known[b] - known[a]) * frac
            elif before:
                a = before[-1]
                mp = known[a] + sign * (cum[i] - cum[a])
            else:
                b = after[0]
                mp = known[b] - sign * (cum[b] - cum[i])
            mp = round(max(mp, 0.0), 1)
        out.append({"place_id": pid, "mp": mp, "prefix": seg["prefix"], "mp_approx": approx,
                    "_gc": cum[i]})
    return out


# Short CTC names (Live Ops M18 strip). The strip's label pass uses `short` only when the full name is wider
# than 1.5x its row's node pitch; a label still too wide is dropped, never centred across neighbours.
SHORT_NAMES = {
    "wash-union": "Washington", "alexandria": "Alexandria", "baltimore-penn": "Baltimore",
    "college-park": "College Park", "lorton-auto-train": "Auto Train", "franconia-spfld": "Franconia",
    "bwi": "BWI Airport", "west-baltimore": "W Baltimore", "new-carrollton": "N Carrollton",
    "martin-state": "Martin State", "camden": "Camden", "jessup-yd": "Jessup Yd", "bayview-yd": "Bayview Yd",
    "backlick": "Backlick", "burke-centre": "Burke", "silver-spring": "Silver Spg", "gaithersburg": "Gaithersbg",
    "crystal-city": "Crystal City", "woodbridge": "Woodbridge", "halethorpe": "Halethorpe",
}


def build_routes(world: World) -> dict[str, dict]:
    routes = {}
    for rdef in ROUTE_DEFS:
        points: list[dict] = []
        for seg in rdef["segments"]:
            pts = fill_mileposts(seg, world)
            for i, p in enumerate(pts):
                if i == 0:
                    route_mi = points[-1]["route_mi"] if points else 0.0
                elif seg["prefix"]:
                    route_mi = points[-1]["route_mi"] + abs(p["mp"] - pts[i - 1]["mp"])
                else:
                    route_mi = points[-1]["route_mi"] + (p["_gc"] - pts[i - 1]["_gc"])
                place = world.places[p["place_id"]]
                points.append({
                    "place_id": p["place_id"], "name": place["name"], "kind": place["kind"],
                    "lat": place["lat"], "lon": place["lon"],
                    "prefix": p["prefix"], "mp": p["mp"], "mp_approx": p["mp_approx"],
                    "mp_label": mp_text(p["prefix"], p["mp"], p["mp_approx"]),
                    "route_mi": round(route_mi, 2),
                })
                if p["place_id"] in SHORT_NAMES:
                    points[-1]["short"] = SHORT_NAMES[p["place_id"]]
        # Mark MP equations where the count changes (same place twice).
        for a, b in zip(points, points[1:]):
            if a["place_id"] == b["place_id"]:
                a["equation"] = b["equation"] = f"{a['mp_label']} | {b['mp_label']}"
        routes[rdef["id"]] = {
            "id": rdef["id"], "name": rdef["name"],
            "left": points[0]["place_id"], "right": points[-1]["place_id"],
            "length_mi": points[-1]["route_mi"], "points": points,
        }
    return routes


def route_point(world: World, route_id: str, place_id: str) -> dict | None:
    return next((p for p in world.routes[route_id]["points"] if p["place_id"] == place_id), None)


# --------------------------------------------------------------------------
# Passenger trains (brief 9.0.5)
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class Service:
    operator: str
    line: str
    prefix: str             # train_id prefix: "MARC 410"
    legs: tuple             # ((route_id, from_place, to_place), ...)
    speed_mph: float
    calls: frozenset        # calling stations
    axles: tuple            # detector axle range
    call_p: float           # chance the crew calls a signal at a point


NEC_ALL = ("wash-union", "new-carrollton", "seabrook", "bowie-state", "odenton", "bwi",
           "halethorpe", "west-baltimore", "baltimore-penn", "martin-state", "edgewood",
           "aberdeen", "perryville")
SERVICES = {
    "marc-penn": Service("MARC", "MARC Penn Line", "MARC",
                         (("r-nec", "wash-union", "perryville"),), 48, frozenset(NEC_ALL),
                         (28, 36), 0.20),
    "marc-camden": Service("MARC", "MARC Camden Line", "MARC",
                           (("r-capital", "wash-union", "camden"),), 36,
                           frozenset(("wash-union", "college-park", "greenbelt", "muirkirk", "laurel",
                                      "savage", "jessup", "dorsey", "st-denis", "camden")),
                           (20, 28), 0.20),
    "marc-brunswick": Service("MARC", "MARC Brunswick Line", "MARC",
                              (("r-metro", "wash-union", "det-gaithersburg"),), 40,
                              frozenset(("wash-union", "silver-spring", "kensington", "rockville",
                                         "gaithersburg")), (24, 32), 0.20),
    "vre-fbg": Service("VRE", "VRE Fredericksburg Line", "VRE",
                       (("r-nec", "quantico", "wash-union"),), 40,
                       frozenset(("quantico", "rippon", "woodbridge", "lorton", "franconia-spfld",
                                  "alexandria", "crystal-city", "lenfant", "wash-union")),
                       (24, 32), 0.20),
    "vre-mss": Service("VRE", "VRE Manassas Line", "VRE",
                       (("r-manassas", "manassas", "alexandria"), ("r-nec", "alexandria", "wash-union")),
                       38, frozenset(("manassas", "burke-centre", "backlick", "alexandria",
                                      "crystal-city", "lenfant", "wash-union")), (24, 32), 0.20),
    "acela": Service("Amtrak", "Amtrak Acela", "Amtrak",
                     (("r-nec", "wash-union", "perryville"),), 80,
                     frozenset(("wash-union", "new-carrollton", "bwi", "baltimore-penn")), (32, 32), 0.16),
    "regional": Service("Amtrak", "Amtrak Northeast Regional", "Amtrak",
                        (("r-nec", "quantico", "perryville"),), 62,
                        frozenset(("quantico", "woodbridge", "alexandria", "wash-union",
                                   "new-carrollton", "bwi", "baltimore-penn", "aberdeen")),
                        (36, 44), 0.16),
    "auto-train": Service("Amtrak", "Amtrak Auto Train", "Amtrak",
                          (("r-nec", "quantico", "lorton-auto-train"),), 45,
                          frozenset(("lorton-auto-train",)), (180, 220), 0.30),
}


@dataclass(frozen=True)
class TrainDef:
    service: str
    number: int
    origin: str
    dest: str
    dep: str | None = None              # origin departure "HH:MM"
    at: tuple | None = None             # (place_id, "HH:MM:SS") the run must hit
    seed: str | None = None             # seed row id the run must hit (its place and time)
    holds: tuple = ()                   # ((place_id, seconds), ...)
    dwell_s: int = 0                    # layover at the origin before departure
    note: str | None = None


def _penn(n, origin, dest, when):
    return _train("marc-penn", n, origin, dest, when)


def _train(service, n, origin, dest, when, **kw):
    if isinstance(when, tuple):
        return TrainDef(service, n, origin, dest, at=when, **kw)
    if when.startswith("tx-"):
        return TrainDef(service, n, origin, dest, seed=when, **kw)
    return TrainDef(service, n, origin, dest, dep=when, **kw)


W, P, B, Q, C, G = "wash-union", "perryville", "baltimore-penn", "quantico", "camden", "det-gaithersburg"
TRAINS = [
    # MARC Penn Line: even numbers toward Washington, odd numbers away from it.
    _penn(400, B, W, "tx-023"), _penn(402, P, W, "04:40"), _penn(404, B, W, "tx-027"),
    _penn(406, P, W, "05:20"), _penn(408, B, W, "05:55"), _penn(410, P, W, "tx-039"),
    _penn(412, B, W, "06:30"), _penn(414, P, W, "06:05"), _penn(416, B, W, "07:05"),
    _penn(418, P, W, "tx-042"), _penn(420, B, W, "07:40"), _penn(422, P, W, "07:30"),
    _penn(424, B, W, "08:25"), _penn(426, B, W, "09:40"), _penn(428, P, W, "11:00"),
    _penn(430, B, W, "12:30"), _penn(432, B, W, "14:00"), _penn(436, P, W, "15:20"),
    _penn(440, B, W, "16:40"), _penn(444, B, W, "17:50"), _penn(448, P, W, "18:45"),
    _penn(452, B, W, "20:15"), _penn(456, B, W, "22:05"),
    _penn(401, W, B, "05:15"), _penn(403, W, P, "06:20"), _penn(405, W, B, "07:45"),
    _penn(407, W, P, "09:05"), _penn(409, W, B, "10:35"), _penn(411, W, P, "12:05"),
    _penn(433, W, P, ("odenton", "14:07:22.6")),    # the keyed scenario's CH54 talker
    _penn(435, W, B, "14:50"), _penn(437, W, P, "15:15"), _penn(439, W, P, "tx-069"),
    _penn(441, W, B, "15:40"), _penn(443, W, P, "16:00"), _penn(445, W, B, "16:15"),
    _penn(447, W, P, "tx-072"), _penn(449, W, B, "16:45"), _penn(451, W, P, "17:00"),
    _penn(453, W, B, "17:12"), _penn(455, W, P, "tx-077"), _penn(457, W, B, "17:55"),
    _penn(459, W, P, "18:25"), _penn(461, W, B, "19:15"), _penn(463, W, P, "20:40"),
    _penn(465, W, B, "22:20"),
    # MARC Camden Line: odd toward Washington, even toward Baltimore.
    _train("marc-camden", 841, C, W, "tx-025"),
    _train("marc-camden", 843, C, W, ("jessup", "05:58:00"),
           note="The MARC train tx-028 has Q409 hold the main for at Jessup."),
    _train("marc-camden", 845, C, W, "06:25"), _train("marc-camden", 847, C, W, "06:55"),
    _train("marc-camden", 849, C, W, "07:30"),
    _train("marc-camden", 861, C, W, ("sig-riverdale", "14:21:50"), holds=(("sig-riverdale", 1150),),
           note="Held at Riverdale behind M418's hotbox stop (tx-064 to tx-067)."),
    _train("marc-camden", 842, W, C, "06:10"), _train("marc-camden", 846, W, C, "tx-048"),
    _train("marc-camden", 848, W, C, "15:55"), _train("marc-camden", 850, W, C, "16:30"),
    _train("marc-camden", 852, W, C, "17:05"), _train("marc-camden", 854, W, C, "17:40"),
    _train("marc-camden", 856, W, C, "18:20"),
    # MARC Brunswick Line (enters and leaves the extent at the Gaithersburg detector).
    _train("marc-brunswick", 870, G, W, "05:35"), _train("marc-brunswick", 872, G, W, "06:10"),
    _train("marc-brunswick", 874, G, W, "06:40"), _train("marc-brunswick", 876, G, W, "07:10"),
    _train("marc-brunswick", 878, G, W, "07:45"), _train("marc-brunswick", 853, W, G, "tx-070"),
    _train("marc-brunswick", 871, W, G, "16:35"), _train("marc-brunswick", 873, W, G, "17:10"),
    _train("marc-brunswick", 875, W, G, "17:45"), _train("marc-brunswick", 877, W, G, "18:30"),
    # VRE Fredericksburg Line (enters and leaves the extent at Quantico).
    _train("vre-fbg", 300, Q, W, "tx-026"), _train("vre-fbg", 302, Q, W, "05:35"),
    _train("vre-fbg", 304, Q, W, "tx-035"),
    _train("vre-fbg", 306, Q, W, ("franconia-spfld", "07:02:00"),
           note="The VRE the BD dispatcher runs around K654 (tx-037)."),
    _train("vre-fbg", 308, Q, W, "07:20"), _train("vre-fbg", 310, Q, W, "07:55"),
    _train("vre-fbg", 301, W, Q, "13:25"), _train("vre-fbg", 303, W, Q, "15:00"),
    _train("vre-fbg", 305, W, Q, "tx-071"),
    _train("vre-fbg", 307, W, Q, ("alexandria", "17:09:50"), holds=(("alexandria", 170),),
           note="Follows Amtrak 93 out of Alexandria (tx-075)."),
    _train("vre-fbg", 309, W, Q, "17:30"), _train("vre-fbg", 311, W, Q, "18:05"),
    _train("vre-fbg", 313, W, Q, "18:45"),
    # VRE Manassas Line.
    _train("vre-mss", 322, "manassas", W, "tx-033"), _train("vre-mss", 324, "manassas", W, "06:10"),
    _train("vre-mss", 326, "manassas", W, "06:40"), _train("vre-mss", 328, "manassas", W, "07:10"),
    _train("vre-mss", 330, "manassas", W, "07:45"), _train("vre-mss", 325, W, "manassas", "15:35"),
    _train("vre-mss", 327, W, "manassas", "tx-073", holds=(("backlick", 270),),
           note="Follows a freight out toward Burke (tx-074)."),
    _train("vre-mss", 329, W, "manassas", "17:25"), _train("vre-mss", 331, W, "manassas", "18:00"),
    _train("vre-mss", 333, W, "manassas", "18:40"),
    # Amtrak Acela: even northbound, odd southbound.
    _train("acela", 2150, W, P, "05:00"), _train("acela", 2154, W, P, "06:55"),
    _train("acela", 2104, W, P, "tx-051"), _train("acela", 2158, W, P, "08:55"),
    _train("acela", 2160, W, P, "11:55"), _train("acela", 2164, W, P, "13:55"),
    _train("acela", 2166, W, P, "15:00"),
    _train("acela", 2163, W, P, "17:40", dwell_s=900,
           note="Seed tx-076 readies 2163's consist at Union Station, so this odd-numbered "
                "Acela originates northbound at Washington."),
    _train("acela", 2170, W, P, "18:00"), _train("acela", 2174, W, P, "20:25"),
    _train("acela", 2151, P, W, "05:20"), _train("acela", 2153, P, W, "tx-034"),
    _train("acela", 2155, P, W, "08:10"), _train("acela", 2157, P, W, "10:10"),
    _train("acela", 2159, P, W, "12:10"), _train("acela", 2161, P, W, "14:15"),
    _train("acela", 2165, P, W, "16:00"), _train("acela", 2167, P, W, "17:20"),
    _train("acela", 2171, P, W, "18:40"), _train("acela", 2257, P, W, ("bwi", "19:28:00"),
                                                 note="Warned of restricted speed at Landover (tx-083)."),
    _train("acela", 2175, P, W, "21:30"),
    # Amtrak Northeast Regional: even northbound, odd southbound. Some run through to Virginia.
    _train("regional", 66, Q, P, "tx-008"), _train("regional", 80, W, P, "06:05"),
    _train("regional", 86, W, P, "07:40:40", dwell_s=1200), _train("regional", 88, W, P, "09:10"),
    _train("regional", 90, Q, P, "08:50"), _train("regional", 92, W, P, "11:20"),
    _train("regional", 94, Q, P, "13:05"), _train("regional", 132, W, P, "14:20"),
    _train("regional", 136, W, P, "16:05"), _train("regional", 176, W, P, "tx-079"),
    _train("regional", 178, W, P, "19:40"),
    _train("regional", 65, P, Q, ("martin-state", "02:57:56.3"),
           note="Its CH54 call at Martin State is the listening scenario's last NEC key-up."),
    _train("regional", 95, P, Q, "tx-024"), _train("regional", 121, P, W, "07:00"),
    _train("regional", 125, P, W, "tx-062"), _train("regional", 129, P, Q, "10:45"),
    _train("regional", 137, P, W, "13:30"), _train("regional", 141, P, W, "15:10"),
    _train("regional", 93, P, Q, ("alexandria", "17:08:30")), _train("regional", 151, P, Q, "19:05"),
    _train("regional", 67, P, Q, "tx-092"),
    # Amtrak Auto Train at Lorton.
    _train("auto-train", 52, Q, "lorton-auto-train", "08:45"),
    _train("auto-train", 53, "lorton-auto-train", Q, "16:00", dwell_s=10800,
           note="Loading at Lorton from 13:00 (seed tx-063 at 14:05)."),
]


@dataclass
class TrainRun:
    train_id: str
    service: Service
    service_key: str
    direction: str
    points: list[dict]      # path points with route_id, arr, dep, stop, edge
    note: str | None = None

    @property
    def start(self) -> float:
        return self.points[0]["arr"]

    @property
    def end(self) -> float:
        return self.points[-1]["arr"]

    def spans(self, t: float) -> bool:
        return self.start <= t <= self.end

    def position(self, t: float) -> dict | None:
        """Linear position in track miles; None when the run does not span t."""
        if not self.spans(t):
            return None
        pts = self.points
        for i, p in enumerate(pts):
            if p["arr"] <= t <= p["dep"]:
                nxt = next((q for q in pts[i + 1:] if q["stop"]), None)
                return self._pos(p, p, 0.0, 0.0, nxt)
        for i, (a, b) in enumerate(zip(pts, pts[1:])):
            if a["dep"] <= t <= b["arr"] and b["arr"] > a["dep"]:
                frac = (t - a["dep"]) / (b["arr"] - a["dep"])
                nxt = next((q for q in pts[i + 1:] if q["stop"]), None)
                return self._pos(a, b, frac, self.service.speed_mph, nxt)
        return None

    def _pos(self, a: dict, b: dict, frac: float, speed: float, nxt: dict | None) -> dict:
        def lerp(x, y):
            return x + (y - x) * frac
        mp = None
        if a["mp"] is not None and b["mp"] is not None and a["prefix"] == b["prefix"]:
            mp = round(lerp(a["mp"], b["mp"]), 1)
        approx = (a["mp_approx"] or b["mp_approx"]) if 0 < frac < 1 else a["mp_approx"]
        return {
            "route_id": b["route_id"], "route_mi": round(lerp(a["route_mi"], b["route_mi"]), 2),
            "prefix": b["prefix"], "mp": mp, "mp_label": mp_text(b["prefix"], mp, approx),
            "lat": round(lerp(a["lat"], b["lat"]), 5), "lon": round(lerp(a["lon"], b["lon"]), 5),
            "speed_mph": speed, "at_place": a["place_id"] if frac == 0 else None,
            "next_stop": nxt["place_id"] if nxt else None,
            "next_stop_t": nxt["arr"] if nxt else None,
        }


def service_path(world: World, service: Service) -> list[dict]:
    path = []
    for route_id, a, b in service.legs:
        pts = world.routes[route_id]["points"]
        ia = next(i for i, p in enumerate(pts) if p["place_id"] == a)
        ib = next(i for i, p in enumerate(pts) if p["place_id"] == b)
        step = 1 if ib >= ia else -1
        path += [{**pts[i], "route_id": route_id} for i in range(ia, ib + step, step)]
    return path


DIRECTIONS = {"r-nec": ("SB", "NB"), "r-capital": ("SB", "NB"), "r-metro": ("EB", "WB"),
              "r-manassas": ("WB", "EB")}


def build_train(world: World, tdef: TrainDef, seed_by_id: dict[str, dict]) -> TrainRun:
    service = SERVICES[tdef.service]
    path = service_path(world, service)
    io = next(i for i, p in enumerate(path) if p["place_id"] == tdef.origin)
    idest = next(i for i, p in enumerate(path) if p["place_id"] == tdef.dest)
    if io > idest:
        path = path[::-1]
        io = next(i for i, p in enumerate(path) if p["place_id"] == tdef.origin)
        idest = max(i for i, p in enumerate(path) if p["place_id"] == tdef.dest)
    else:
        idest = max(i for i, p in enumerate(path) if p["place_id"] == tdef.dest)
    path = [dict(p) for p in path[io:idest + 1]]

    holds = dict(tdef.holds)
    t, seen = 0.0, set()
    for i, p in enumerate(path):
        if i:
            prev = path[i - 1]
            miles = abs(p["route_mi"] - prev["route_mi"]) if p["route_id"] == prev["route_id"] else 0.0
            t += miles / service.speed_mph * 3600
        p["arr"] = t
        hold = holds.get(p["place_id"], 0) if p["place_id"] not in seen else 0
        seen.add(p["place_id"])
        p["dep"] = t = t + hold
        p["stop"] = p["place_id"] in service.calls
        p["edge"] = i in (0, len(path) - 1) and not p["stop"]
    path[0]["arr"] -= tdef.dwell_s

    if tdef.seed:
        row = seed_by_id[tdef.seed]
        anchor_place, anchor_t = resolve_seed_place(world, row, seed_by_id), float(row["t_offset_s"])
    elif tdef.at:
        anchor_place, anchor_t = tdef.at[0], clock(tdef.at[1])
    else:
        assert tdef.dep is not None, f"{tdef.service} {tdef.number} has no dep, at, or seed"
        anchor_place, anchor_t = tdef.origin, clock(tdef.dep)
    anchor = next(p for p in path if p["place_id"] == anchor_place)
    shift = anchor_t - (anchor["dep"] if anchor_place == tdef.origin else anchor["arr"])
    for p in path:
        p["arr"] += shift
        p["dep"] += shift

    first = path[0]
    second = next(p for p in path[1:] if p["route_id"] == first["route_id"] and p["route_mi"] != first["route_mi"])
    rising = second["route_mi"] > first["route_mi"]
    direction = DIRECTIONS[path[0]["route_id"]][1 if rising else 0]
    train_id = f"{service.prefix} {tdef.number}"
    return TrainRun(train_id, service, tdef.service, direction, path, tdef.note)


def build_trains(world: World) -> list[TrainRun]:
    seed_by_id = {r["id"]: r for r in world.seed_rows}
    return [build_train(world, tdef, seed_by_id) for tdef in TRAINS]


def train_record(run: TrainRun) -> dict:
    stops = []
    for p in run.points:
        rec = {
            "place_id": p["place_id"], "route_id": p["route_id"], "mp": p["mp_label"],
            "route_mi": p["route_mi"], "t": round(p["arr"], 1), "clock": hms(p["arr"]),
            "stop": p["stop"],
        }
        if p["dep"] != p["arr"]:
            rec |= {"t_dep": round(p["dep"], 1), "clock_dep": hms(p["dep"])}
        if p["edge"]:
            rec["edge"] = True
        if stops and stops[-1]["place_id"] == p["place_id"]:
            stops[-1]["mp_equation"] = f"{stops[-1]['mp']} | {p['mp_label']}"
            stops[-1]["route_id_next"] = p["route_id"]
            continue
        stops.append(rec)
    return {
        "train_id": run.train_id, "operator": run.service.operator, "line": run.service.line,
        "service": run.service_key, "direction": run.direction,
        "start_t": round(run.start, 1), "end_t": round(run.end, 1),
        "start_clock": hms(run.start), "end_clock": hms(run.end),
        "crosses_midnight": run.start < 0 or run.end >= DAY,
        "routes": sorted({p["route_id"] for p in run.points}),
        "stops": stops, "note": run.note, "sim": True,
    }


def trains_at(runs: list[TrainRun], t: float) -> list[tuple[TrainRun, dict]]:
    """Positions at t, resolving runs that cross midnight on the repeating day."""
    out = []
    for run in runs:
        for shift in (0, DAY, -DAY):
            pos = run.position(t + shift)
            if pos:
                out.append((run, pos))
                break
    return out


# --------------------------------------------------------------------------
# Feed health (brief 8.9)
# --------------------------------------------------------------------------

FEED_EVENTS = {
    "feed-alx": [("09:31:20", "stale", "STALE · RATE 84%"), ("09:33:05", "ok", "")],
    "feed-lnd": [("14:05:00", "offline", "RECONNECTING"), ("14:06:00", "fault", "FAULT · LINK LOST"),
                 ("14:06:58", "ok", "")],
    "feed-bwi": [("11:12:05", "offline", "RECONNECTING"), ("11:12:41", "ok", "")],
    "feed-bay": [("02:14:00", "stale", "STALE · NO SAMPLES"), ("02:19:00", "fault", "FAULT · NO SAMPLES 5M"),
                 ("02:23:30", "ok", ""), ("14:05:10", "stale", "STALE · NO SAMPLES"),
                 ("14:06:48", "ok", "")],
}
FEED_ACKS = [("feed-lnd", "14:06:31", "FAULT · LINK LOST")]
FEED_STATIC = {
    "feed-alx": {"driver": "rtl_tcp", "gain_db": 38.6, "ppm": 0, "noise_floor_dbfs": -47.0},
    "feed-lnd": {"driver": "rtl_tcp", "gain_db": 40.2, "ppm": 1, "noise_floor_dbfs": -45.0},
    "feed-bwi": {"driver": "rtl_tcp", "gain_db": 33.8, "ppm": -2, "noise_floor_dbfs": -49.0},
    "feed-bay": {"driver": "sdrviz-agent", "driver_sim": True, "gain_db": 36.4, "ppm": 0,
                 "noise_floor_dbfs": -44.0},
}
CENTER_MHZ, SAMPLE_RATE = 160.890, 2.400
RTL_TCP_NA = ["device_temp_c", "host_cpu_pct", "host_temp_c", "device_drops"]


class Health:
    def __init__(self) -> None:
        self.events = {fid: [(clock(t), s, lbl) for t, s, lbl in evs] for fid, evs in FEED_EVENTS.items()}
        self.acks = [(fid, clock(t), reason) for fid, t, reason in FEED_ACKS]
        # Spans with no samples (stale NO SAMPLES starts 30 s after the last sample).
        self.outages: dict[str, list[tuple[float, float]]] = defaultdict(list)
        for fid, evs in self.events.items():
            start = None
            for t, state, label in evs:
                if state == "ok" and start is not None:
                    self.outages[fid].append((start, t))
                    start = None
                elif start is None and (state == "offline" or "NO SAMPLES" in label):
                    start = t - 30 if state == "stale" else t

    def state(self, fid: str, t: float) -> dict:
        t %= DAY
        current = {"state": "ok", "label": "", "since": None}
        episode = None
        for et, state, label in self.events.get(fid, []):
            if et > t:
                break
            current = {"state": state, "label": label, "since": et}
            episode = None if state == "ok" else (episode or et)
        current["episode_start"] = episode
        acked = [a for a in self.acks if a[0] == fid and a[2] == current["label"]
                 and current["since"] is not None and current["since"] <= a[1] <= t]
        current["acked"] = bool(acked) and current["state"] == "fault"
        current["acked_at"] = acked[-1][1] if current["acked"] else None
        return current

    def link_down(self, fid: str, t: float) -> bool:
        """True while the feed's link is down (offline / reconnecting, or a LINK LOST fault).

        A feed with no link has no sample-rate measurement at all (Don't #12: no zero for
        unknown). A connected feed that delivers no samples (stale) measures a true 0.
        """
        st = self.state(fid, t)
        return st["state"] == "offline" or (st["state"] == "fault" and "LINK" in st["label"])

    def receiving(self, fid: str, t: float) -> bool:
        t %= DAY
        return not any(a <= t < b for a, b in self.outages[fid])

    def last_sample_age(self, fid: str, t: float) -> float:
        tt = t % DAY
        for a, b in self.outages[fid]:
            if a <= tt < b:
                return tt - a
        return 0.2

    def spans(self, fid: str, start: float, end: float) -> list[dict]:
        """Non-ok spans overlapping [start, end) on the repeating day."""
        out = []
        for shift in (-DAY, 0):
            evs = self.events.get(fid, [])
            for (t, state, label), nxt in zip(evs, evs[1:] + [(DAY, "ok", "")]):
                a, b = t + shift, nxt[0] + shift
                if state != "ok" and b > start and a < end:
                    out.append({"start_t": round(a, 1), "end_t": round(b, 1),
                                "start": hms(a), "end": hms(b), "state": state, "label": label,
                                "active": a <= end < b})
        return out


def snr_model(dist_km: float, reach_km: float, rng: random.Random) -> float:
    return round(min(38.0, max(5.0, 34.0 - 26.0 * dist_km / reach_km + rng.gauss(0, 1.5))), 1)


def receptions(world: World, health: Health, channel: str, loc: tuple[float, float], t: float,
               rng: random.Random, role: str, primary: str | None = None) -> list[dict]:
    """Receptions per brief 9.0.3: every feed that hears the channel, is receiving and is in range."""
    factor = DETECTOR_REACH if role == "detector" else VOICE_REACH
    out = []
    for fid in world.heard_by(channel):
        if not health.receiving(fid, t):
            continue
        feed = world.feeds[fid]
        dist = km_between(loc, (feed["lat"], feed["lon"]))
        reach = feed["coverage_radius_km"] * factor
        if dist > reach and fid != primary:
            continue
        snr = snr_model(min(dist, reach), reach, rng)
        out.append({"feed_id": fid, "snr_db": snr,
                    "rssi_dbfs": round(FEED_STATIC[fid]["noise_floor_dbfs"] + snr, 1),
                    "dist_km": round(dist, 1)})
    if primary:
        prim = next((r for r in out if r["feed_id"] == primary), None)
        if prim is None:
            return []
        for r in out:
            if r is not prim and r["snr_db"] >= prim["snr_db"]:
                r["snr_db"] = round(max(4.0, prim["snr_db"] - rng.uniform(1.0, 4.0)), 1)
                r["rssi_dbfs"] = round(FEED_STATIC[r["feed_id"]]["noise_floor_dbfs"] + r["snr_db"], 1)
    out.sort(key=lambda r: r["snr_db"], reverse=True)
    return out


# --------------------------------------------------------------------------
# Transmissions
# --------------------------------------------------------------------------

@dataclass
class Tx:
    id: str
    t: float
    duration: float
    channel: str
    role: str
    speaker: str | None
    text: str
    loc: tuple[float, float]
    place_id: str | None = None
    train_id: str | None = None
    state: str = "final"
    sim: bool = True
    receptions: list[dict] = field(default_factory=list)
    words: list[dict] = field(default_factory=list)
    confidence: float | None = None
    latency: float = 2.0
    seed_row: dict | None = None

    @property
    def end(self) -> float:
        return self.t + self.duration

    @property
    def feed(self) -> str:
        return self.receptions[0]["feed_id"]


@dataclass
class KeyUp:
    """One planned key-up inside an exchange, before it is placed."""
    dt: float
    channel: str
    role: str
    speaker: str | None
    text: str
    place_id: str | None = None
    loc: tuple[float, float] | None = None
    train_id: str | None = None
    duration: float | None = None
    state: str = "final"
    primary: str | None = None


def speech_duration(text: str, rng: random.Random, role: str) -> float:
    words = len(text.split())
    rate = 2.3 if role == "detector" else 2.7
    return round(max(1.2, 0.5 + words / rate * rng.uniform(0.92, 1.1)), 1)


def make_words(text: str, duration: float, rng: random.Random) -> tuple[list[dict], float | None]:
    tokens = text.split()
    if not tokens:
        return [], None
    words, pos = [], 0
    for tok in tokens:
        idx = text.index(tok, pos)
        pos = idx + len(tok)
        hard = tok[:1].isupper() or any(ch.isdigit() for ch in tok)
        low = rng.random() < (0.07 if hard else 0.015)
        conf = rng.uniform(0.38, 0.59) if low else rng.uniform(0.82, 0.995)
        words.append({"w": tok, "conf": round(conf, 2),
                      "t": round(0.2 + (idx / len(text)) * max(0.1, duration - 0.4), 2)})
    return words, round(statistics.fmean(w["conf"] for w in words), 2)


class Traffic:
    """Places key-ups on channels without overlap and with real receptions."""

    def __init__(self, world: World, health: Health, rng: random.Random) -> None:
        self.world, self.health, self.rng = world, health, rng
        self.busy: dict[str, list[tuple[float, float]]] = defaultdict(list)
        self.rows: list[Tx] = []
        self.kerchunks: list[dict] = []
        self.nec_bank = set(world.bank("bank-nec")["frequency_ids"])

    # Windows that only seed and scripted rows may use (scenario purity).
    def reserved(self, channel: str, start: float, end: float) -> bool:
        windows = [(clock("03:39:00"), clock("03:40:30")),     # listening: nothing keyed
                   (clock("14:06:10"), clock("14:06:45")),     # fault frames: nothing keyed
                   (clock("14:07:10"), clock("14:07:45"))]     # keyed: only the scripted three
        if channel in self.nec_bank:
            windows.append((clock("02:58:00.5"), clock("03:40:30")))  # listening: 42M since CH54
        return any(start < b and end > a for a, b in windows)

    def free(self, channel: str, start: float, end: float) -> bool:
        spans = self.busy[channel]
        i = bisect.bisect_left(spans, (start, end))
        for a, b in spans[max(0, i - 2): i + 2]:
            if start < b + GUARD_S and end + GUARD_S > a:
                return False
        return 0 <= start and end < DAY

    def occupy(self, channel: str, start: float, end: float) -> None:
        bisect.insort(self.busy[channel], (start, end))

    def add(self, tx: Tx) -> None:
        self.occupy(tx.channel, tx.t, tx.end)
        self.rows.append(tx)

    def exchange(self, start: float, keyups: list[KeyUp], *, scripted: bool = False,
                 shifts: tuple = (0, 9, 18, 31, 47)) -> bool:
        """Place a call/response exchange, shifting it later if a channel is busy."""
        rng = self.rng
        for kp in keyups:
            if kp.duration is None:
                kp.duration = speech_duration(kp.text, rng, kp.role) if kp.text else round(rng.uniform(0.4, 1.4), 1)
            if kp.loc is None:
                kp.loc = self.world.loc(kp.place_id or CHANNEL_HOME.get(kp.channel, "wash-union"))
        for shift in shifts:
            t0 = start + shift
            times, t = [], t0
            for i, kp in enumerate(keyups):
                if i:
                    t = times[-1] + keyups[i - 1].duration + kp.dt
                times.append(round(t, 1))
            ok = all(self.free(kp.channel, ts, ts + kp.duration)
                     and (scripted or not self.reserved(kp.channel, ts, ts + kp.duration))
                     for kp, ts in zip(keyups, times))
            if ok:
                break
        else:
            return False
        placed = False
        for kp, ts in zip(keyups, times):
            assert kp.duration is not None and kp.loc is not None  # set in the first loop
            recs = receptions(self.world, self.health, kp.channel, kp.loc, ts, rng, kp.role, kp.primary)
            if not recs:
                if not placed:
                    return False      # nobody heard the opening call: drop the exchange
                continue
            text = kp.text if kp.state == "final" else ""
            words, conf = make_words(text, kp.duration, rng)
            self.add(Tx(id="", t=ts, duration=kp.duration, channel=kp.channel, role=kp.role,
                        speaker=kp.speaker, text=text, loc=kp.loc, place_id=kp.place_id,
                        train_id=kp.train_id, state=kp.state, receptions=recs, words=words,
                        confidence=conf,
                        latency=round(1.1 + 0.07 * kp.duration + abs(rng.gauss(0, 0.35)), 1)))
            placed = True
        return placed


# Seed place resolution ------------------------------------------------------

@functools.cache
def aliases() -> list[tuple[str, str]]:
    """Spoken name -> place id, longest names first (call after load_world fills SAY)."""
    table = {name: pid for pid, name in SAY.items() if not pid.startswith("det-")}
    for pid, name in SAY.items():
        if pid.startswith("det-"):
            table.setdefault(name, pid)
    table |= EXTRA_ALIASES
    return sorted(table.items(), key=lambda kv: -len(kv[0]))


def find_place(text: str) -> str | None:
    hits = []
    for name, pid in aliases():
        m = re.search(rf"(?<![\w']){re.escape(name)}(?![\w'])", text)
        if m:
            hits.append((m.start(), -len(name), pid))
    return min(hits)[2] if hits else None


def detector_for(world: World, speaker: str) -> str | None:
    for pid, p in world.places.items():
        if p.get("kind") == "detector" and p["name"].replace(" defect detector", "") in speaker:
            return pid
    return None


def resolve_seed_place(world: World, row: dict, seed_by_id: dict[str, dict]) -> str | None:
    if row["speaker_role"] == "detector":
        det = detector_for(world, row["speaker"])
        if det:
            return det
    place = find_place(row["transcript"])
    if place:
        return place
    rows = list(seed_by_id.values())
    i = rows.index(row)
    for prev in reversed(rows[max(0, i - 4):i]):
        if prev["frequency_id"] == row["frequency_id"] and row["t_offset_s"] - prev["t_offset_s"] < 180:
            return resolve_seed_place(world, prev, seed_by_id)
    return CHANNEL_HOME.get(row["frequency_id"])


TRAIN_NAME = re.compile(r"\b(MARC|Amtrak|VRE|Train)\s+(\d{2,4})\b")


def seed_train_id(row: dict) -> str | None:
    if "Auto Train" in row["speaker"]:
        return "Amtrak 53"
    m = TRAIN_NAME.search(row["speaker"]) or TRAIN_NAME.search(row["transcript"])
    if not m:
        return None
    prefix = "Amtrak" if m.group(1) == "Train" else m.group(1)
    return f"{prefix} {m.group(2)}"


def add_seed_rows(traffic: Traffic, rng: random.Random) -> None:
    world = traffic.world
    seed_by_id = {r["id"]: r for r in world.seed_rows}
    for row in world.seed_rows:
        place = resolve_seed_place(world, row, seed_by_id)
        feed = world.feeds[row["feed_id"]]
        loc = world.loc(place) if place else (feed["lat"], feed["lon"])
        recs = receptions(world, traffic.health, row["frequency_id"], loc, row["t_offset_s"], rng,
                          row["speaker_role"], primary=row["feed_id"])
        if not recs:
            raise SystemExit(f"seed row {row['id']}: primary feed {row['feed_id']} is not receiving")
        words, conf = make_words(row["transcript"], row["duration_s"], rng)
        traffic.add(Tx(id=row["id"], t=float(row["t_offset_s"]), duration=row["duration_s"],
                       channel=row["frequency_id"], role=row["speaker_role"], speaker=row["speaker"],
                       text=row["transcript"], loc=loc, place_id=place, train_id=seed_train_id(row),
                       sim=False, receptions=recs, words=words, confidence=conf,
                       latency=round(1.1 + 0.07 * row["duration_s"] + abs(rng.gauss(0, 0.35)), 1),
                       seed_row=row))


# Scripted moments (brief 9.0.6) --------------------------------------------

def add_scripted(traffic: Traffic) -> None:
    lst = clock("02:57:56.3")
    traffic.exchange(lst, [KeyUp(0, "amtk-nec-road", "crew", "Amtrak 65 engineer",
                                 "Amtrak 65 clear signal Martin State, track 2.", "martin-state",
                                 train_id="Amtrak 65", duration=3.7, primary="feed-bay")],
                     scripted=True, shifts=(0,))
    keyed = [
        (clock("14:07:21.0"), KeyUp(0, "csx-be-disp", "crew", "CSX Q216",
            "BE, Q216 by Bayview on number 2, ready to come down through the tunnel, and we've got "
            "a bad order to set out at Mount Clare.", "bayview-yd", duration=11.2, primary="feed-bay")),
        (clock("14:07:22.6"), KeyUp(0, "amtk-nec-road", "crew", "MARC 433 engineer",
            "433 approach medium, Odenton, track 3. Dispatcher, we'll need a couple of minutes "
            "at BWI for the lift.", "odenton", train_id="MARC 433", duration=9.6, primary="feed-bwi")),
        (clock("14:07:27.1"), KeyUp(0, "csx-road", "crew", "CSX K741",
            "CSX K741 clear signal College Park, number 2 main, we'll be stopping short of Hyattsville.",
            "college-park", duration=6.2, primary="feed-lnd")),
        (clock("14:07:35.0"), KeyUp(0, "amtk-nec-road", "dispatcher", "Amtrak dispatcher",
            "433, dispatcher, copy, take your time at BWI, nothing behind you.", "odenton",
            train_id="MARC 433", duration=4.1, primary="feed-bwi")),
        (clock("14:07:35.8"), KeyUp(0, "csx-be-disp", "dispatcher", "CSX BE dispatcher",
            "Q216, BE. Hold at Bayview, I've got one coming out of Howard Street, about ten minutes.",
            "bayview-yd", duration=5.2, primary="feed-bay")),
    ]
    for t, kp in keyed:
        if not traffic.exchange(t, [kp], scripted=True, shifts=(0,)):
            raise SystemExit(f"scripted key-up at {hms(t)} on {kp.channel} could not be placed")


# Train-driven traffic --------------------------------------------------------

ASPECTS = ["clear signal", "clear signal", "approach", "approach medium", "approach limited",
           "medium clear", "approach medium"]
CALLABLE_KINDS = {"station", "interlocking", "signal", "bridge", "tunnel"}


def train_number(run: TrainRun) -> str:
    return run.train_id.split()[-1]


def say_train(run: TrainRun, rng: random.Random) -> str:
    return run.train_id if rng.random() < 0.45 else train_number(run)


def track_phrase(prefix: str | None, rng: random.Random) -> str:
    if prefix == "NEC":
        return f", track {rng.choice([1, 2, 2, 3, 3, 4])}"
    if prefix in ("CFP", "BAA", "BA"):
        return f", number {rng.choice([1, 2])}" if rng.random() < 0.6 else ""
    return ""


def add_train_traffic(traffic: Traffic, runs: list[TrainRun]) -> None:
    rng = traffic.rng
    for run in runs:
        for i, p in enumerate(run.points):
            if i and run.points[i - 1]["place_id"] == p["place_id"]:
                continue
            kind = traffic.world.places[p["place_id"]]["kind"]
            if p["place_id"].startswith("det-"):
                add_detector_pass(traffic, run, p)
                continue
            if kind not in CALLABLE_KINDS or rng.random() > run.service.call_p * crew_talk_factor(p["arr"]):
                continue
            channel = ROAD_CHANNEL[p["prefix"]]
            name = SAY[p["place_id"]]
            who = say_train(run, rng)
            pos_t = p["arr"]
            if p["stop"] and i and run.service.operator != "Amtrak" and rng.random() < 0.35:
                text = f"{who} ready on the rear, {name}, highball."
                speaker, t = f"{run.train_id} conductor", p["dep"] + rng.uniform(2, 8)
            elif run.service_key == "acela" and p["prefix"] == "NEC" and rng.random() < 0.15:
                text = f"{who} cab speed {rng.choice([110, 125, 125, 135])}{track_phrase('NEC', rng)}, {name}."
                speaker, t = f"{run.train_id} engineer", pos_t - rng.uniform(5, 20)
            else:
                text = f"{who} {rng.choice(ASPECTS)} {name}{track_phrase(p['prefix'], rng)}."
                speaker, t = f"{run.train_id} engineer", pos_t - rng.uniform(5, 25)
            pos = run.position(t) or run.position(pos_t)
            assert pos is not None, f"{run.train_id} is not running at {pos_t}"
            keyups = [KeyUp(0, channel, "crew", speaker, text, p["place_id"],
                            loc=(pos["lat"], pos["lon"]), train_id=run.train_id)]
            if rng.random() < 0.10 and p["prefix"] in DISPATCH:
                keyups += dispatcher_followup(run, p, rng)
            traffic.exchange(t, keyups, shifts=(0, 4, 8))
        add_terminal_calls(traffic, run)


def dispatcher_followup(run: TrainRun, p: dict, rng: random.Random) -> list[KeyUp]:
    channel, desk, speaker = DISPATCH[p["prefix"]]
    num = train_number(run)
    nxt = next((q for q in run.points if q["arr"] > p["arr"] + 300 and q["stop"]), None)
    where = SAY[nxt["place_id"]] if nxt else SAY[run.points[-1]["place_id"]]
    nec = p["prefix"] == "NEC"
    trk = rng.choice([1, 2, 3, 4] if nec else [1, 2])
    on = f"track {trk}" if nec else f"number {trk}"       # the NEC says "track", CSX and NS "number"
    addr = f"{run.service.prefix} {num}"
    lines = [
        (f"{addr}, {desk}. You're lined on {on} to {where}, nothing ahead of you.",
         f"{on.capitalize()} to {where}, {num}."),
        (f"{addr}, {desk}. Restricted speed on {on} at {SAY[p['place_id']]}, signal trouble, "
         f"call me when you're by.", f"Restricted on {trk}, will call, {num}."),
        (f"{addr}, {desk}. I'm gonna cross you over to {on} for a work gang.",
         f"Over to {trk}, {num}."),
        (f"{addr}, {desk}. Keep it to 30 through the plant at {where}, they're on the ground.",
         f"30 through {where}, {num}."),
    ]
    disp_text, ack = rng.choice(lines)
    loc = (p["lat"], p["lon"])
    return [KeyUp(rng.uniform(2, 6), channel, "dispatcher", speaker, disp_text, p["place_id"], loc=loc,
                  train_id=run.train_id),
            KeyUp(rng.uniform(1.5, 4), channel, "crew",
                  f"{run.train_id} engineer", ack, p["place_id"], loc=loc, train_id=run.train_id)]


def add_terminal_calls(traffic: Traffic, run: TrainRun) -> None:
    """Washington Terminal and K Tower calls for trains starting or ending at Union Station."""
    rng = traffic.rng
    first, last = run.points[0], run.points[-1]
    trk = rng.choice(range(7, 31))
    if first["place_id"] == "wash-union" and rng.random() < 0.45 * crew_talk_factor(first["dep"]):
        channel, op = rng.choice([("amtk-wash-term", "Washington Terminal"), ("amtk-k-tower", "K Tower")])
        text = rng.choice([f"{run.train_id}, {op}, you're lined out of track {trk}, have a good trip.",
                           f"{run.train_id}, {op}, you're lined out of {trk}, signal's coming up."])
        traffic.exchange(first["dep"] - rng.uniform(25, 60),
                         [KeyUp(0, channel, "operator", op, text, "wash-union", train_id=run.train_id)],
                         shifts=(0, 6, 12))
        if run.service.operator == "Amtrak" and rng.random() < 0.5:
            text = f"Train {train_number(run)}, station ops, your consist is on track {trk}, crew is on board."
            traffic.exchange(first["dep"] - rng.uniform(420, 720),
                             [KeyUp(0, "amtk-wash-ops2", "operator", "Washington ops", text, "wash-union",
                                    train_id=run.train_id)], shifts=(0, 20, 40))
    if last["place_id"] == "wash-union" and rng.random() < 0.3 * crew_talk_factor(last["arr"]):
        text = f"{run.train_id}, K Tower, you're lined into track {trk}."
        keyups = [KeyUp(0, "amtk-k-tower", "operator", "K Tower operator", text, "wash-union",
                        train_id=run.train_id),
                  KeyUp(rng.uniform(1.5, 3), "amtk-k-tower", "crew", f"{run.train_id} engineer",
                        f"Into {trk}, {train_number(run)}.", "wash-union", train_id=run.train_id)]
        traffic.exchange(last["arr"] - rng.uniform(30, 50), keyups, shifts=(0, 4, 8))


def detector_text(mp: float, axles: int, mph: int, rng: random.Random, temp: int | None) -> str:
    track = f", track {rng.choice([1, 2])}" if rng.random() < 0.5 else ""
    nd = "No defects, no defects" if rng.random() < 0.3 else "No defects"
    t = f" Temperature {temp} degrees." if temp is not None else ""
    return (f"CSX equipment detector, milepost {mp:.1f}{track}. {nd}. Total axles {axles}. "
            f"Train speed {mph} miles per hour.{t} Detector out.")


def air_temp(t: float) -> int:
    """A November weekday: 41 F before dawn, 58 F mid-afternoon."""
    hour = (t % DAY) / 3600
    return round(49.5 + 8.5 * math.sin((hour - 9) / 24 * 2 * math.pi))


def add_detector_pass(traffic: Traffic, run: TrainRun, p: dict) -> None:
    rng = traffic.rng
    det = traffic.world.places[p["place_id"]]
    axles = rng.randint(*run.service.axles) // 4 * 4
    mph = min(79, round(run.service.speed_mph * rng.uniform(0.95, 1.25)))
    temp = air_temp(p["arr"]) if rng.random() < 0.4 else None
    text = detector_text(p["mp"], axles, mph, rng, temp)
    traffic.exchange(p["arr"] + rng.uniform(20, 45),
                     [KeyUp(0, det["frequency_id"], "detector", f"CSX detector {SAY[p['place_id']]}",
                            text, p["place_id"], train_id=run.train_id)], shifts=(0, 15, 30))


# Freight, yard, MOW and onboard chatter --------------------------------------

def csx_symbol(rng: random.Random) -> str:
    return f"{rng.choice('QQQMMIKLGBEW')}{rng.randint(1, 9)}{rng.randint(0, 9)}{rng.randint(1, 9)}"


def ns_symbol(rng: random.Random) -> str:
    return rng.choice([str(rng.randint(11, 39) * 10 + rng.randint(1, 9)), f"H7{rng.randint(1, 9)}"])


PLACE_POOLS = {
    "csx": ["college-park", "sig-riverdale", "greenbelt", "laurel", "savage", "jessup", "dorsey",
            "st-denis", "kensington", "rockville", "silver-spring", "det-hyattsville"],
    "rfp": ["sig-slaters-lane", "sig-af", "sig-ro", "alexandria", "franconia-spfld", "lorton",
            "woodbridge", "sig-van-dorn", "crystal-city", "lenfant", "va-ave-tunnel", "long-bridge"],
    "ns": ["manassas", "burke-centre", "backlick", "sig-springfield", "sig-edsall", "sig-cr-tower"],
    "be": ["bayview-yd", "sig-hb", "camden", "mt-clare", "locust-point", "curtis-bay",
           "det-waverly", "det-white-marsh", "howard-st-tunnel"],
    "landover": ["landover-int", "benning-yd", "va-ave-tunnel"],
}
DESKS = {
    "csx-bc-disp": ("BC", "CSX BC dispatcher", "csx", csx_symbol, "the MARC train"),
    "csx-bd-disp": ("BD", "CSX BD dispatcher", "rfp", csx_symbol, "the VRE"),
    "csx-be-disp": ("BE", "CSX BE dispatcher", "be", csx_symbol, "the Amtrak"),
    "csx-ni-disp": ("Landover", "CSX Landover dispatcher", "landover", csx_symbol, "the intermodal"),
    "ns-hag-disp": ("Hagerstown", "NS Hagerstown dispatcher", "ns", ns_symbol, "the VRE"),
}
ROAD_POOLS = {"csx-road": ("CSX", "csx", csx_symbol), "csx-rfp-road": ("CSX", "rfp", csx_symbol),
              "ns-road": ("NS", "ns", ns_symbol), "csx-landover": ("CSX", "landover", csx_symbol)}
YARDS = {
    "csx-jessup": ("Jessup", "Jessup yardmaster", "jessup-yd", "CSX"),
    "csx-benning": ("Benning", "Benning yardmaster", "benning-yd", "CSX"),
    "csx-bayview": ("Bayview", "Bayview yardmaster", "bayview-yd", "CSX"),
    "csx-locust-pt": ("Locust Point", "Locust Point yardmaster", "locust-point", "CSX"),
    "csx-curtis-bay": ("Curtis Bay", "Curtis Bay yardmaster", "curtis-bay", "CSX"),
    "ns-bayview": ("Bayview", "NS Bayview yardmaster", "bayview-yd", "NS"),
    "csx-ind-switch": ("Seawall", "CSX Seawall job", "curtis-bay", "job"),
    "canton-1": ("Canton", "Canton RR job", "pt-canton", "job"),
    "tpr-road": ("Tradepoint", "Tradepoint job", "sparrows-point", "job"),
}

# channel -> (kind, exchanges per hour at 1x, hourly profile)
CHATTER = {
    "amtk-nec-road": ("nec-disp", 0.5, "rush"),
    "csx-road": ("road", 0.7, "rush"), "csx-rfp-road": ("road", 0.5, "rush"),
    "ns-road": ("road", 0.45, "rush"), "csx-landover": ("road", 0.3, "flat"),
    "csx-bc-disp": ("desk", 1.1, "rush"), "csx-bd-disp": ("desk", 1.1, "rush"),
    "csx-be-disp": ("desk", 1.1, "rush"), "csx-ni-disp": ("desk", 0.4, "rush"),
    "ns-hag-disp": ("desk", 1.0, "rush"),
    "csx-jessup": ("yard", 0.35, "flat"), "csx-benning": ("yard", 0.25, "flat"),
    "csx-bayview": ("yard", 0.35, "flat"), "csx-locust-pt": ("yard", 0.3, "flat"),
    "csx-curtis-bay": ("yard", 0.35, "flat"), "ns-bayview": ("yard", 0.3, "flat"),
    "csx-ind-switch": ("yard", 0.2, "flat"), "canton-1": ("yard", 0.25, "flat"),
    "tpr-road": ("yard", 0.25, "flat"), "amtk-ivy-city": ("ivy", 0.4, "rush"),
    "amtk-wash-term": ("terminal", 0.1, "rush"), "amtk-k-tower": ("terminal", 0.08, "rush"),
    "amtk-mow-27": ("mow", 0.3, "day"), "csx-mow": ("mow", 0.25, "day"),
    "ns-mow": ("mow", 0.15, "day"), "tpr-mow": ("mow", 0.15, "day"),
    "amtk-auto-train": ("onboard", 0.0, "flat"),
}
CHATTER_SCALE = 0.55         # tunes the day toward about 1,200 transmissions
FREIGHT_DETECTOR_PASSES = 7    # freight trains per detector per day (flat)


def stratified(rng: random.Random, expected: float) -> int:
    """Expected count with a random remainder: far less noisy than Poisson for small rates."""
    whole = math.floor(expected)
    return whole + (rng.random() < expected - whole)


def crew_talk_factor(t: float) -> float:
    """Crews and dispatchers talk more when the railroad is crowded (brief 9.0.6 profile)."""
    return profile_factor("rush", int((t % DAY) // 3600), 1.0) / 1.6


def profile_factor(profile: str, hour: int, jitter: float) -> float:
    if profile == "rush":
        return 0.4 if hour in NIGHT_HOURS else 2.5 if hour in RUSH_HOURS else 1.0
    if profile == "day":
        return 1.5 if 7 <= hour < 17 else 0.25
    return jitter      # flat: 0.8-1.2 per hour


def desk_exchange(channel: str, rng: random.Random) -> list[KeyUp]:
    desk, disp, pool, symbol, pax = DESKS[channel]
    sym = symbol(rng)
    crew = f"{'NS' if symbol is ns_symbol else 'CSX'} {sym}"
    place, place2 = rng.sample(PLACE_POOLS[pool], 2)
    here, there = SAY[place], SAY[place2]
    n, mins, trk = rng.randint(4, 30), rng.choice([5, 10, 15, 20]), rng.choice([1, 2])
    asks = [f"{desk}, {sym} by {here}, checking on our lineup.",
            f"{desk} dispatcher, {sym} at a stop signal at {here}, over.",
            f"{desk}, {sym}, we're stopped at {here} to set off {n} cars.",
            f"{desk}, {sym} at {here}, ready to depart.",
            f"{desk}, {sym}, we're in the clear at {here}."]
    replies = [  # (dispatcher answer, matching crew ack)
        (f"{sym}, {desk}. Hold the main there, I've got {pax} coming by you in about {mins} minutes.",
         f"Hold the main at {here}, {sym}."),
        (f"{sym}, {desk}. You're lined to {there}, take it easy through the plant.", f"Lined to {there}, {sym}."),
        (f"{sym}, {desk}. Stand by, I've got one coming at you on number {trk}.", f"Standing by, {sym}."),
        (f"{sym}, {desk}. I'll have a signal for you in about {mins} minutes.", f"{mins} minutes, {sym}."),
        (f"{sym}, {desk}. Roger, follow {pax} out, it'll be approach signals for a few blocks.",
         f"Follow {pax}, {sym}."),
        (f"{sym}, {desk}. Copy, call me when you're in the clear.", f"Will do, {sym}."),
    ]
    answer, ack = rng.choice(replies)
    keyups = [KeyUp(0, channel, "crew", crew, rng.choice(asks), place),
              KeyUp(rng.uniform(3, 12), channel, "dispatcher", disp, answer, place)]
    keyups.append(KeyUp(rng.uniform(1.5, 4), channel, "crew", crew, ack, place))  # crews read back
    return keyups


def road_exchange(channel: str, rng: random.Random) -> list[KeyUp]:
    rr, pool, symbol = ROAD_POOLS[channel]
    sym = symbol(rng)
    place = rng.choice(PLACE_POOLS[pool])
    name = SAY[place]
    trk = f", number {rng.choice([1, 2])}" if rng.random() < 0.5 else ""
    text = rng.choice([f"{rr} {sym} {rng.choice(ASPECTS)} {name}{trk}.",
                       f"{sym} {rng.choice(ASPECTS)} {name}.",
                       f"{rr} {sym} by {name}{trk}, highball."])
    return [KeyUp(0, channel, "crew", f"{rr} {sym}", text, place)]


def nec_dispatch_exchange(rng: random.Random) -> list[KeyUp]:
    place = rng.choice(["landover-int", "bowie-state", "odenton", "bwi", "halethorpe", "baltimore-penn",
                        "martin-state", "new-carrollton"])
    trk = rng.choice([1, 2, 3, 4])
    return [KeyUp(0, "amtk-nec-road", "MOW", "Amtrak foreman",
                  f"Dispatcher, foreman on the signal crew at {SAY[place]}, we're clear of track {trk}.",
                  place),
            KeyUp(rng.uniform(3, 8), "amtk-nec-road", "dispatcher", "Amtrak dispatcher",
                  f"Copy foreman, clear of track {trk} at {SAY[place]}, thanks.", place)]


def yard_exchange(channel: str, rng: random.Random) -> list[KeyUp]:
    yard, master, place, rr = YARDS[channel]
    cars, trk = rng.randint(3, 40), rng.randint(1, 12)
    if rr == "job":
        crew = master
        lines = [f"{yard} job to the engineer, come back {min(cars, 12)} cars.",
                 f"{yard} job, conductor, {rng.randint(2, 6)} cars to a coupling, you're on the joint.",
                 f"{yard} job, we're clear of the main at track {trk}."]
        keyups = [KeyUp(0, channel, "crew", crew, rng.choice(lines), place)]
        if rng.random() < 0.5:
            keyups.append(KeyUp(rng.uniform(1, 3), channel, "crew", crew, f"{min(cars, 12)} cars.", place))
        return keyups
    sym = csx_symbol(rng) if rr == "CSX" else ns_symbol(rng)
    sym = f"Y{rng.randint(1, 3)}{rng.randint(0, 9)}{rng.randint(1, 9)}" if rng.random() < 0.5 and rr == "CSX" else sym
    kind = rng.random()
    if kind < 0.4:
        return [KeyUp(0, channel, "yardmaster", master,
                      f"{sym}, {yard} yard, your {rng.choice(['pickup', 'empties', 'cars', 'set'])} "
                      f"{'is' if rng.random() < 0.3 else 'are'} on {trk}, {cars} cars.", place),
                KeyUp(rng.uniform(2, 6), channel, "crew", f"{rr} {sym}", f"{trk}, {cars} cars, {sym}.", place)]
    if kind < 0.7:
        n = rng.randint(4, 12)
        return [KeyUp(0, channel, "crew", f"{rr} {sym} conductor", f"{sym} to the engineer, come back {n} cars.", place),
                KeyUp(rng.uniform(1.5, 4), channel, "crew", f"{rr} {sym} engineer", f"{n} cars.", place),
                KeyUp(rng.uniform(8, 20), channel, "crew", f"{rr} {sym} conductor",
                      f"{max(1, n // 2)} cars... two... one... that'll do.", place)]
    return [KeyUp(0, channel, "crew", f"{rr} {sym}", f"{yard} yard, {sym}, we're in the clear on {trk}, tying down.", place),
            KeyUp(rng.uniform(2, 6), channel, "yardmaster", master, f"Roger {sym}, tie 'em down, thanks.", place)]


def ivy_exchange(rng: random.Random) -> list[KeyUp]:
    trk = rng.randint(1, 18)
    equip = rng.choice(["MARC set", "VRE set", "Acela set", "Regional consist", "Amfleet set"])
    return [KeyUp(0, "amtk-ivy-city", "yardmaster", "Ivy City yardmaster",
                  f"Hostler on the {equip} on {trk}, you have the blue flag cleared, pull down to the "
                  f"end of the shop track.", "ivy-city"),
            KeyUp(rng.uniform(2, 5), "amtk-ivy-city", "crew", "Ivy City hostler",
                  f"Pulling down to the end of {trk}, hostler.", "ivy-city")]


def terminal_exchange(channel: str, rng: random.Random) -> list[KeyUp]:
    trk = rng.randint(7, 30)
    op = "K Tower" if channel == "amtk-k-tower" else "Washington Terminal"
    line = rng.choice(["Penn Line", "Camden Line", "VRE", "Acela", "Regional"])
    return [KeyUp(0, channel, "operator", f"{op} operator" if op == "K Tower" else op,
                  f"Ivy City hostler, {op}, you're lined from the yard to track {trk} for the {line} equipment.",
                  "wash-union"),
            KeyUp(rng.uniform(2, 5), channel, "crew", "Ivy City hostler", f"Lined to {trk}, hostler.", "wash-union")]


def mow_exchange(channel: str, t: float, rng: random.Random) -> list[KeyUp]:
    trk = rng.choice([1, 2, 3, 4])
    until = hms(t + rng.choice([1800, 2700, 3600]))[:5].replace(":", "")
    if channel == "amtk-mow-27":
        a, b = rng.sample(["Landover", "New Carrollton", "Seabrook", "Bowie", "Odenton", "BWI", "Halethorpe"], 2)
        gang = rng.choice(["tie gang", "catenary crew", "signal crew", "track crew"])
        return [KeyUp(0, channel, "MOW", "Amtrak foreman",
                      f"Dispatcher, foreman on the {gang}, requesting foul time on track {trk}, {a} to {b}.",
                      "bowie-state"),
                KeyUp(rng.uniform(4, 10), channel, "dispatcher", "Amtrak dispatcher",
                      f"Foreman, dispatcher, you've got foul time on track {trk}, {a} to {b}, until {until}.",
                      "bowie-state"),
                KeyUp(rng.uniform(2, 4), channel, "MOW", "Amtrak foreman", f"Track {trk}, {a} to {b}, until {until}.",
                      "bowie-state")]
    if channel == "csx-mow":
        a, b = rng.sample(["Lorton", "Pohick", "Franconia", "Woodbridge", "Van Dorn", "Alexandria"], 2)
        insp = rng.randint(4400, 4499)
        return [KeyUp(0, channel, "MOW", "CSX track inspector",
                      f"BD dispatcher, track inspector {insp} requesting track and time on number {rng.choice([1, 2])} "
                      f"main between {a} and {b}.", "lorton"),
                KeyUp(rng.uniform(6, 15), "csx-bd-disp", "dispatcher", "CSX BD dispatcher",
                      f"Inspector {insp}, BD, you've got 30 minutes between {a} and {b}, call me when you're clear.",
                      "lorton")]
    if channel == "ns-mow":
        return [KeyUp(0, channel, "MOW", "NS signal maintainer",
                      f"Maintainer {rng.randint(300, 399)} to the Hagerstown dispatcher, I'm on the ground at "
                      f"{rng.choice(['Burke', 'Backlick', 'Edsall', 'Springfield'])}, testing the crossing.",
                      "burke-centre")]
    return [KeyUp(0, channel, "MOW", "Tradepoint MOW",
                  f"MOW to TPR job {rng.choice(['one', 'two'])}, we're clear of track {trk}, you're good to come through.",
                  "sparrows-point")]


def onboard_exchange(rng: random.Random) -> list[KeyUp]:
    n = rng.randint(1, 30)
    return rng.choice([
        [KeyUp(0, "amtk-auto-train", "crew", "Auto Train car attendant",
               f"Car attendant to yard, we're ready for the next ramp, auto rack {n}.", "lorton-auto-train",
               train_id="Amtrak 53")],
        [KeyUp(0, "amtk-auto-train", "crew", "Auto Train coach attendant",
               f"Coach attendant, we're boarding car {n % 12 + 1}, wheelchair at the ramp.", "lorton-auto-train",
               train_id="Amtrak 53"),
         KeyUp(rng.uniform(2, 5), "amtk-auto-train", "crew", "Auto Train yard",
               "Copy, sending a cart down now.", "lorton-auto-train", train_id="Amtrak 53")],
    ])


def add_chatter(traffic: Traffic) -> None:
    rng = traffic.rng
    for channel, (kind, rate, profile) in CHATTER.items():
        carry = rng.random()  # systematic sampling: the hourly profile holds exactly over the day
        for hour in range(24):
            lam = CHATTER_SCALE * rate * profile_factor(profile, hour, rng.uniform(0.8, 1.2))
            count, carry = int(carry + lam), (carry + lam) % 1
            for _ in range(count):
                t = hour * 3600 + rng.uniform(0, 3540)
                keyups = {
                    "desk": lambda: desk_exchange(channel, rng),
                    "road": lambda: road_exchange(channel, rng),
                    "nec-disp": lambda: nec_dispatch_exchange(rng),
                    "yard": lambda: yard_exchange(channel, rng),
                    "ivy": lambda: ivy_exchange(rng),
                    "terminal": lambda: terminal_exchange(channel, rng),
                    "mow": lambda: mow_exchange(channel, t, rng),
                }[kind]()
                traffic.exchange(t, keyups)
    # Auto Train loading at Lorton while 53 is in the terminal (13:00-16:00).
    for _ in range(9):
        traffic.exchange(rng.uniform(clock("13:05"), clock("15:55")), onboard_exchange(rng))


def add_freight_detectors(traffic: Traffic) -> None:
    rng = traffic.rng
    for pid, det in traffic.world.places.items():
        if det.get("kind") != "detector":
            continue
        mp = float(re.sub(r"[A-Z]", "", det["milepost"]))
        for _ in range(stratified(rng, FREIGHT_DETECTOR_PASSES)):
            t = rng.uniform(0, DAY - 60)
            text = detector_text(mp, rng.randint(25, 115) * 4, rng.randint(18, 55), rng,
                                 air_temp(t) if rng.random() < 0.4 else None)
            traffic.exchange(t, [KeyUp(0, det["frequency_id"], "detector",
                                       f"CSX detector {det['name'].replace(' defect detector', '')}",
                                       text, pid)])


def add_irregular(traffic: Traffic) -> None:
    """Carrier-only key-ups, undecodable and failed clips, and kerchunks (brief 9.7)."""
    rng = traffic.rng
    voice = [tx for tx in traffic.rows if tx.role != "detector"]
    # Odd clips happen where the traffic is: each lands a minute or two after a real key-up.
    for state, n in (("carrier_only", 30), ("undecodable", 6), ("failed", 4)):
        pool = voice if state != "undecodable" else [tx for tx in voice if tx.channel.startswith(("csx", "ns"))]
        for _ in range(n):
            near = rng.choice(pool)
            duration = None if state == "carrier_only" else round(rng.uniform(2.0, 6.0), 1)
            traffic.exchange(near.end + rng.uniform(20, 150),
                             [KeyUp(0, near.channel, "unknown", None, "", near.place_id, loc=near.loc,
                                    state=state, duration=duration)])
    for ch in traffic.world.monitored:
        for _ in range(rng.randint(1, 4)):
            t, dur = round(rng.uniform(0, DAY - 10), 1), round(rng.uniform(0.08, 0.24), 2)
            if not traffic.free(ch, t, t + dur) or traffic.reserved(ch, t, t + dur):
                continue
            feeds = [f for f in traffic.world.heard_by(ch) if traffic.health.receiving(f, t)]
            if not feeds:
                continue
            traffic.occupy(ch, t, t + dur)
            traffic.kerchunks.append({"t_offset_s": t, "clock_local": hms(t, tenths=True),
                                      "frequency_id": ch, "feed_id": rng.choice(feeds),
                                      "duration_s": dur, "sim": True})


def generate_traffic(world: World, health: Health, runs: list[TrainRun], rng: random.Random) -> Traffic:
    traffic = Traffic(world, health, rng)
    add_seed_rows(traffic, rng)
    add_scripted(traffic)
    add_train_traffic(traffic, runs)
    add_freight_detectors(traffic)
    add_chatter(traffic)
    add_irregular(traffic)
    traffic.rows.sort(key=lambda tx: (tx.t, tx.channel))
    traffic.kerchunks.sort(key=lambda k: k["t_offset_s"])
    n = 0
    for tx in traffic.rows:
        if tx.sim:
            n += 1
            tx.id = f"sim-{n:04d}"
    for i, k in enumerate(traffic.kerchunks, 1):
        k["id"] = f"kc-{i:03d}"
    return traffic


def tx_record(world: World, tx: Tx) -> dict:
    freq = world.freqs[tx.channel]
    extra = {
        "receptions": tx.receptions, "train_id": tx.train_id, "place_id": tx.place_id,
        "transcript_state": tx.state, "confidence": tx.confidence, "words": tx.words,
        "decode_latency_s": tx.latency,
    }
    if tx.seed_row is not None:
        return {**tx.seed_row, "sim": False, "source": "SEED", "sim_fields": list(extra), **extra}
    return {
        "id": tx.id, "t_offset_s": tx.t, "clock_local": hms(tx.t), "frequency_id": tx.channel,
        "freq_mhz": freq["freq_mhz"], "aar_channel": freq["aar_channel"], "feed_id": tx.feed,
        "speaker_role": tx.role, "speaker": tx.speaker, "duration_s": tx.duration,
        "transcript": tx.text, "fictional": True, "sim": True, "source": "SIM", **extra,
    }


# --------------------------------------------------------------------------
# Stats
# --------------------------------------------------------------------------

DET_RE = {
    "axles": re.compile(r"Total axles (\d+)"), "mph": re.compile(r"speed (\d+) miles"),
    "defect": re.compile(r"Defect, defect\. (.+?)\. Train speed"),
    "mp": re.compile(r"milepost (\d+\.\d)"),
}


def detector_fields(world: World, tx: Tx) -> dict | None:
    if tx.role != "detector":
        return None
    out = {}
    for key in ("axles", "mph"):
        m = DET_RE[key].search(tx.text)
        out[key] = int(m.group(1)) if m else None
    m = DET_RE["defect"].search(tx.text)
    out["defect"] = bool(m)
    out["defect_text"] = m.group(1) if m else None
    place = world.places.get(tx.place_id or "")
    if place and place.get("kind") == "detector":
        out["mp_label"] = re.sub(r"([A-Z]+)(\d)", r"\1 \2", place["milepost"])
        out["detector_id"] = place["id"]
    else:
        m = DET_RE["mp"].search(tx.text)
        out["mp_label"] = f"MP {m.group(1)}" if m else None
        out["detector_id"] = None
    return out


def window_rows(rows: list[Tx], start: float, end: float) -> list[Tx]:
    """Rows starting in [start, end) on the repeating day (start may be negative)."""
    out = []
    for shift in (-DAY, 0, DAY):
        lo, hi = start - shift, end - shift
        out += [replace(tx, t=tx.t + shift) if shift else tx for tx in rows if lo <= tx.t < hi]
    return sorted(out, key=lambda tx: tx.t)


def bins(start: float, end: float, width: int) -> tuple[float, int]:
    first = math.floor(start / width) * width
    return first, math.ceil((end - first) / width)


def channel_stats(world: World, rows: list[Tx], kerchunks: list[dict], start: float, end: float) -> dict:
    h0, nh = bins(start, end, 3600)
    m0, nm = bins(start, end, 600)
    per: dict[str, dict] = {}
    total_air = sum(aired(tx, end) for tx in rows)
    for cid, freq in world.freqs.items():
        mine = [tx for tx in rows if tx.channel == cid]
        counts, air_h, air_10 = [0] * nh, [0.0] * nh, [0.0] * nm
        for tx in mine:
            counts[int((tx.t - h0) // 3600)] += 1
            air_h[int((tx.t - h0) // 3600)] += aired(tx, end)
            air_10[int((tx.t - m0) // 600)] += aired(tx, end)
        busy = sorted(range(nh), key=lambda i: (-counts[i], i))[:3]
        last = mine[-1] if mine else None
        airtime = sum(aired(tx, end) for tx in mine)
        per[cid] = {
            "frequency_id": cid, "label": freq["label"], "aar_channel": freq["aar_channel"],
            "aar4": aar4(freq["aar_channel"]), "monitored": cid in world.monitored,
            "banks": world.banks_of(cid), "count": len(mine), "airtime_s": round(airtime, 1),
            "airtime_label": total_label(airtime),
            "airtime_share": round(airtime / total_air, 3) if total_air else 0.0,
            "avg_duration_s": round(airtime / len(mine), 1) if mine else None,
            "blips": sum(1 for k in kerchunks if k["frequency_id"] == cid and start <= k["t_offset_s"] < end),
            "counts_per_hour": counts, "airtime_per_hour": [round(a, 1) for a in air_h],
            "airtime_per_10min": [round(a, 1) for a in air_10],
            "busy_hours": [hms(h0 + i * 3600)[:2] for i in busy if counts[i]],
            "last_heard": {"tx_id": last.id, "t": round(last.t, 1), "clock": hms(last.t),
                           "end_t": round(last.end, 1)} if last else None,
        }
    return {"start_t": round(start, 1), "end_t": round(end, 1), "start": hms(start), "end": hms(end),
            "hour_bins_start_t": h0, "hour_labels": [hms(h0 + i * 3600)[:2] for i in range(nh)],
            "ten_min_bins_start_t": m0, "channels": per}


def summary_stats(world: World, rows: list[Tx], kerchunks: list[dict], health: Health,
                  start: float, end: float) -> dict:
    ch = channel_stats(world, rows, kerchunks, start, end)
    total_air = sum(aired(tx, end) for tx in rows)
    busiest = max(ch["channels"].values(), key=lambda c: c["airtime_s"])
    talkers = Counter(tx.train_id or tx.speaker for tx in rows if tx.speaker or tx.train_id)
    finals = [tx for tx in rows if tx.state == "final" and tx.confidence is not None]
    hist = [0] * 10
    for tx in finals:
        assert tx.confidence is not None  # finals are filtered above
        hist[min(9, int(tx.confidence * 10))] += 1
    detectors = []
    for pid, det in world.places.items():
        if det.get("kind") != "detector":
            continue
        reports: list[tuple[Tx, dict]] = []
        for tx in rows:
            if tx.place_id == pid and tx.role == "detector":
                fields = detector_fields(world, tx)  # only None for non-detector roles
                assert fields is not None
                reports.append((tx, fields))
        last = reports[-1] if reports else None
        detectors.append({
            "detector_id": pid, "name": det["name"], "mp_label": re.sub(r"([A-Z]+)(\d)", r"\1 \2", det["milepost"]),
            "frequency_id": det["frequency_id"], "reports": len(reports),
            "defects": sum(1 for _, f in reports if f["defect"]),
            "last": {"tx_id": last[0].id, "clock": hms(last[0].t), "axles": last[1]["axles"],
                     "mph": last[1]["mph"], "defect": last[1]["defect"]} if last else None,
        })
    return {
        **ch,
        "totals": {"count": len(rows), "airtime_s": round(total_air, 1), "airtime_label": total_label(total_air),
                   "blips": sum(c["blips"] for c in ch["channels"].values())},
        "busiest": {"frequency_id": busiest["frequency_id"], "aar": f"CH{busiest['aar_channel']:02d}",
                    "label": busiest["label"], "share": busiest["airtime_share"],
                    "share_label": f"{round(busiest['airtime_share'] * 100)}%"},
        "top_channels": [c["frequency_id"] for c in sorted(ch["channels"].values(), key=lambda c: -c["airtime_s"])[:10]],
        "top_talkers": [{"name": n, "count": c} for n, c in talkers.most_common(10)],
        "detectors": detectors,
        "decoder": {"engine": "moonshine (SIM)", "final_rows": len(finals),
                    "confidence_histogram": hist, "confidence_bins": [round(i / 10, 1) for i in range(11)],
                    "median_latency_s": round(statistics.median(tx.latency for tx in rows), 1) if rows else None},
        "feed_uptime": {fid: health.spans(fid, start, end) for fid in world.feeds},
    }


def density_checks(world: World, rows: list[Tx], day_stats: dict) -> dict:
    total_air = sum(tx.duration for tx in rows)
    rush = [tx for tx in rows if int(tx.t // 3600) in RUSH_HOURS]
    by_time = sorted(rows, key=lambda tx: tx.t)
    overlapping = 0
    for tx in rush:
        i = bisect.bisect_left([r.t for r in by_time], tx.t - 30)
        if any(o.channel != tx.channel and o.t < tx.end and o.end > tx.t for o in by_time[i:i + 60]):
            overlapping += 1
    top8 = sorted(day_stats["channels"].values(), key=lambda c: -c["count"])[:8]
    ratios = []
    for c in top8:
        rush_n = statistics.fmean(c["counts_per_hour"][h] for h in RUSH_HOURS)
        mid_n = statistics.fmean(c["counts_per_hour"][h] for h in MIDDAY_HOURS)
        rush_a = statistics.fmean(c["airtime_per_hour"][h] for h in RUSH_HOURS)
        mid_a = statistics.fmean(c["airtime_per_hour"][h] for h in MIDDAY_HOURS)
        ratios.append({"frequency_id": c["frequency_id"], "count": c["count"],
                       "rush_over_midday_count": round(rush_n / mid_n, 2) if mid_n else None,
                       "rush_over_midday_airtime": round(rush_a / mid_a, 2) if mid_a else None})
    return {
        "transmissions": len(rows), "target_transmissions": "about 1200",
        "airtime_h": round(total_air / 3600, 2), "target_airtime_h": "1.5-2.5",
        "rush_overlap_pct": round(100 * overlapping / len(rush), 1), "target_rush_overlap_pct": ">= 8",
        "top8_rush_vs_midday": ratios, "target_rush_vs_midday": ">= 2.0 (rush 05-09 + 15-19 vs 10-14)",
    }


# --------------------------------------------------------------------------
# Scenarios
# --------------------------------------------------------------------------

SCENARIOS = {
    "listening": {"t": "03:40:00", "bank": "bank-nec", "admin_feed": "feed-lnd",
                  "admin_feed_why": "Nothing is off: the active bank's home feed.",
                  "summary": "Dark cockpit: nothing keyed; NEC bank last key-up 42 min ago on CH54."},
    "fault": {"t": "14:06:22", "bank": "bank-commuter", "admin_feed": "feed-lnd",
              "admin_feed_why": "The worst feed (unacked fault) is inspected first.",
              "summary": "BAY-04 STALE 1M 12S and LND-02 FAULT · LINK LOST, unacknowledged."},
    "fault-acked": {"t": "14:06:36", "bank": "bank-commuter", "admin_feed": "feed-lnd",
                    "admin_feed_why": "The acked fault is still the worst feed.",
                    "summary": "As fault, after LND-02 was acknowledged at 14:06:31."},
    "keyed": {"t": "14:07:30", "bank": "bank-commuter", "admin_feed": "feed-bay",
              "admin_feed_why": "BAY-04 is the only sdrviz-agent feed and hears 2 of the 3 live key-ups "
                                "(CH66 at -12.9 dBFS), so the inspector shows agent-era telemetry beside live TX.",
              "summary": "CH54 MARC 433 + CH08 CSX K741 + off-bank CH66 transmitting; feeds recovered."},
}

# Feed severity for the Feeds & Banks hero (brief 9.4 "worst current value", 8.9 escalation):
# unacked fault > acked fault > offline > stale. Lower sorts first.
def feed_severity(feed: dict) -> int:
    if feed["state"] == "fault":
        return 1 if feed["acked"] else 0
    return {"offline": 2, "stale": 3}.get(feed["state"], 9)


# System-state moments (brief 8.4-8.7) for design/mockups/system.html. They sit on top of
# the "listening" snapshot (03:40:00): the backend link drops and the app is restarted there.
SYSTEM_BASE = "listening"
SYSTEM_FIRST_DATA_WAIT_S = 6           # 8.6: past 5 s the status line says so
SYSTEM_BACKOFF_S = [1, 2, 4, 8]        # 8.6: capped at 8 s
SYSTEM_NO_LINK_AFTER_S = 15            # 8.4: backend unreachable >= 15 s
SYSTEM_LINK_DROP_AGE_S = {"reconnecting": 9, "no-link": 22}
SYSTEM_EMPTY_BANK = {"id": "bank-new", "name": "New Bank", "frequency_ids": [], "home_feed": "feed-lnd",
                     "sim": True}


def coverage(world: World, health: Health, channel: str, t: float) -> dict:
    pips = []
    for fid in world.heard_by(channel):
        st = health.state(fid, t)
        pips.append({"feed_id": fid, "short": feed_short(world.feeds[fid]), "state": st["state"]})
    states = [p["state"] for p in pips]
    healthy = states.count("ok")
    if not pips:
        state = "offline"
    elif healthy == len(pips):
        state = "ok"
    elif healthy:
        state = "partial"
    elif "stale" in states:
        state = "stale"
    else:
        state = "offline"
    return {"state": state, "healthy": healthy, "total": len(pips),
            "label": f"{healthy}/{len(pips)} FEEDS" if state == "partial" else None, "pips": pips}


def stale_readout(health: Health, pips: list[dict], t: float) -> str:
    """Tile status readout for a stale channel (spec §5.5).

    A feed that is stale on sample rate still delivers samples, so its age is always
    about zero and "AGE 0S" would read as a dead zero (Don't #12). When every unhealthy
    feed is rate-stale, the readout carries the rate instead, worded as the feed label:
    "STALE · RATE 84%" -> "RATE 84%". Otherwise it is the age of the freshest silent feed.
    """
    causes = [(p, health.state(p["feed_id"], t)) for p in pips if p["state"] != "ok"]
    rate = [st["label"].replace("STALE · ", "") for p, st in causes
            if st["state"] == "stale" and "RATE" in st["label"] and health.receiving(p["feed_id"], t)]
    if rate and len(rate) == len(causes):
        return rate[0]
    silent = [p for p in pips if not health.receiving(p["feed_id"], t)] or pips
    return "AGE " + age_label(min(health.last_sample_age(p["feed_id"], t) for p in silent), "age")


def row_view(world: World, tx: Tx, t: float, bank_ids: set[str]) -> dict:
    live = tx.t <= t < tx.end
    decoding = live or (tx.end <= t < tx.end + tx.latency)
    freq = world.freqs[tx.channel]
    more = len(tx.receptions) - 1
    return {
        "id": tx.id, "t_offset_s": round(tx.t, 1), "clock": hms(tx.t), "clock_tenths": hms(tx.t, tenths=True),
        "aar": f"CH{freq['aar_channel']:02d}", "aar4": aar4(freq["aar_channel"]),
        "frequency_id": tx.channel, "label": freq["label"], "off_bank": tx.channel not in bank_ids,
        "feed_id": tx.feed, "feed_label": feed_short(world.feeds[tx.feed]) + (f" +{more}" if more else ""),
        "role": tx.role, "role_tag": ROLE_TAGS[tx.role], "speaker": tx.speaker, "train_id": tx.train_id,
        "place_id": tx.place_id, "duration_s": tx.duration,
        "state": "decoding" if decoding else tx.state, "final_state": tx.state, "live": live,
        "transcript": "" if decoding else tx.text, "words": [] if decoding else tx.words,
        "confidence": None if decoding else tx.confidence, "detector": detector_fields(world, tx),
        "sim": tx.sim,
    }


def feed_view(world: World, health: Health, fid: str, t: float, series: dict) -> dict:
    feed, static, st = world.feeds[fid], FEED_STATIC[fid], health.state(fid, t)
    minute = int((t % DAY) // 60)
    s = series[fid]
    age = health.last_sample_age(fid, t)
    telemetry = ({k: s[k][minute] for k in ("device_temp_c", "host_cpu_pct", "device_drops")}
                 if static["driver"] == "sdrviz-agent" else None)
    return {
        "id": fid, "short": feed_short(feed), "name": feed["name"], "site": feed["site"],
        "lat": feed["lat"], "lon": feed["lon"], "coverage_radius_km": feed["coverage_radius_km"],
        "hears": feed["hears"], "driver": static["driver"] + (" · SIM" if static.get("driver_sim") else ""),
        "sim": True, "enabled": True, "state": st["state"], "label": st["label"],
        "since_t": st["since"] if st["state"] != "ok" else None,
        "since": hms(st["since"]) if st["state"] != "ok" else None,
        "in_state_s": round(t % DAY - st["since"], 1) if st["state"] != "ok" else None,
        "in_state_label": age_label(t % DAY - st["since"], "age") if st["state"] != "ok" else None,  # how long degraded: AGE form
        "episode_start": hms(st["episode_start"]) if st["episode_start"] is not None else None,
        "acked": st["acked"], "acked_at": hms(st["acked_at"]) if st["acked_at"] else None,
        "last_sample_age_s": round(age, 1), "last_sample_age_label": age_label(age, "age") if age >= 1 else None,
        "center_mhz": CENTER_MHZ, "sample_rate_msps": SAMPLE_RATE,
        "sample_rate_measured_msps": None if health.link_down(fid, t) else s["sample_rate_msps"][minute],
        "gain_db": static["gain_db"], "ppm": static["ppm"],
        "snr_db": s["snr_db"][minute], "noise_floor_dbfs": s["noise_floor_dbfs"][minute],
        "telemetry": telemetry, "telemetry_na": RTL_TCP_NA if telemetry is None else [],
        "sample_rate_15m": [None if health.link_down(fid, t - (14 - i) * 60) else s["sample_rate_msps"][(minute - 14 + i) % 1440]
                            for i in range(15)],
    }


def map_counts(world: World, trains: int) -> dict:
    stations = sum(1 for p in world.places.values()
                   if p["kind"] == "station" and not p.get("derived") and p["id"] != "lorton-auto-train")
    detectors = sum(1 for p in world.places.values() if p["kind"] == "detector")
    tracked = f"{trains} TRAIN{'' if trains == 1 else 'S'} TRACKED"
    return {"feeds": len(world.feeds), "stations": stations, "detectors": detectors, "trains_tracked": trains,
            "corner_readout": f"{len(world.feeds)} FEEDS · {stations} STATIONS · {tracked}"}


def snapshot(name: str, world: World, health: Health, rows: list[Tx], kerchunks: list[dict],
             runs: list[TrainRun], series: dict, system_series: dict) -> dict:
    spec = SCENARIOS[name]
    t = clock(spec["t"])
    history_rows = window_rows(rows, t - DAY, t + 0.001)
    heard = [tx for tx in history_rows if tx.t <= t]
    active = [tx for tx in heard if tx.end > t]
    active_ids = {tx.id for tx in active}

    channels = []
    for cid, freq in world.freqs.items():
        mine = [tx for tx in heard if tx.channel == cid]
        done = [tx for tx in mine if tx.end <= t]
        now = next((tx for tx in mine if tx.id in active_ids), None)
        last = done[-1] if done else None
        cov = coverage(world, health, cid, t)
        if now:
            state = "tx"
        elif last and t - last.end < CHANNEL_RANGES["recent"]:
            state = "recent"
        elif last and t - last.end < CHANNEL_RANGES["recent-dim"]:
            state = "recent-dim"
        else:
            state = "idle"
        if now:
            readout = None  # the promoted TX timer takes the zone
        elif cov["state"] == "offline":
            readout = "RECONNECTING" if cov["pips"] and all(
                health.state(p["feed_id"], t)["state"] == "offline" for p in cov["pips"]) else "NO FEEDS"
        elif cov["state"] == "stale":
            readout = stale_readout(health, cov["pips"], t)
        elif last and t - last.end < CHANNEL_RANGES["recent-dim"]:
            readout = "LAST " + age_label(t - last.end)  # the LAST readout clears with the ember (brief §4, spec §5.5)
        else:
            readout = None
        spark = [0.0] * 12
        for tx in mine:
            if t - 3600 <= tx.t:
                spark[min(11, int((tx.t - (t - 3600)) // 300))] += round(tx.duration, 1)
        channels.append({
            "id": cid, "label": freq["label"], "aar": f"CH{freq['aar_channel']:02d}",
            "aar4": aar4(freq["aar_channel"]), "freq_mhz": freq["freq_mhz"], "railroad": freq["railroad"],
            "use": freq["use"], "monitored": cid in world.monitored, "banks": world.banks_of(cid),
            "heard_by": world.heard_by(cid), "coverage": cov, "state": state, "status_readout": readout,
            "channel_fault": None,
            "tx": {"tx_id": now.id, "elapsed_s": round(t - now.t, 1),
                   "timer": f"{int((t - now.t) // 60):02d}:{(t - now.t) % 60:04.1f}",
                   "primary_feed": now.feed, "via": feed_short(world.feeds[now.feed]),
                   "receptions": now.receptions, "train_id": now.train_id} if now else None,
            "last_heard": {"tx_id": last.id, "end_t": round(last.end, 1), "clock": hms(last.t),
                           "age_s": round(t - last.end, 1), "age_label": age_label(t - last.end),
                           "via": feed_short(world.feeds[last.feed])} if last else None,
            "spark_60m": [round(v, 1) for v in spark],
        })
    by_id = {c["id"]: c for c in channels}

    views = {}
    for bank in world.banks:
        ids = set(bank["frequency_ids"])
        keyed = sorted((by_id[c] for c in ids if by_id[c]["tx"]), key=lambda c: -c["tx"]["elapsed_s"])
        off = [c for c in channels if c["tx"] and c["id"] not in ids]
        last_in_bank = max((c for c in channels if c["id"] in ids and c["last_heard"]),
                           key=lambda c: c["last_heard"]["end_t"], default=None)
        disp = bank["home_feed"]
        not_on_disp = [c for c in channels if c["tx"] and all(r["feed_id"] != disp for r in c["tx"]["receptions"])]
        hero = {"mode": "keyed" if keyed else "idle"}
        if keyed:
            h = keyed[0]
            hero |= {"aar4": h["aar4"], "label": h["label"], "via": h["tx"]["via"], "timer": h["tx"]["timer"],
                     "line": f"KEYED · VIA {h['tx']['via']}", "others": [c["aar4"] for c in keyed[1:]],
                     "others_label": f"+{len(keyed) - 1} · " + " · ".join(c["aar4"] for c in keyed[1:])
                     if len(keyed) > 1 else None}
        elif last_in_bank:
            lh = last_in_bank["last_heard"]
            hero |= {"age_label": lh["age_label"], "aar": last_in_bank["aar"], "label": last_in_bank["label"],
                     "line": f"LAST KEY-UP {lh['age_label']} AGO · {last_in_bank['aar']} · {last_in_bank['label']}"}
        views[bank["id"]] = {
            "bank_id": bank["id"], "name": bank["name"], "tile_ids": bank["frequency_ids"],
            "tile_count": len(bank["frequency_ids"]), "hero": hero, "displayed_feed": disp,
            "displayed_feed_label": f"FEED · {feed_short(world.feeds[disp])}",
            "off_bank_active": [c["aar4"] for c in off],
            "off_bank_label": f"+{len(off)} OFF-BANK · " + " · ".join(c["aar4"] for c in off) if off else None,
            "not_on_displayed_feed": [{"aar4": c["aar4"], "feed": c["tx"]["via"]} for c in not_on_disp],
            "selector_extra_label": (f"+{len(not_on_disp)} ON " + " · ".join(sorted({c["tx"]["via"] for c in not_on_disp})))
            if not_on_disp else None,
        }

    feeds = [feed_view(world, health, fid, t, series) for fid in world.feeds]
    minute = int((t % DAY) // 60) // 5
    system = {k: {kk: vv[minute] for kk, vv in v.items() if isinstance(vv, list)} | {"state": "ok"}
              for k, v in system_series.items()}
    faults = [{"object": f["id"], "kind": "feed", "short": f["short"], "state": f["state"], "label": f["label"],
               "since": f["since"], "acked": f["acked"], "acked_at": f["acked_at"]}
              for f in feeds if f["state"] in ("fault",)]
    degraded = [{"object": f["id"], "kind": "feed", "short": f["short"], "state": f["state"], "label": f["label"],
                 "since": f["since"], "in_state_label": f["in_state_label"]}
                for f in feeds if f["state"] in ("stale", "offline")]
    healthy = sum(f["state"] == "ok" for f in feeds)
    acked = sum(f["acked"] for f in faults)
    ranked = sorted((f for f in feeds if f["enabled"] and f["state"] != "ok"), key=feed_severity)
    worst = ranked[0] if ranked else None
    header = {
        "feeds_chip": f"FEEDS {healthy}/{len(feeds)}" + (f" · {acked} ACK'D" if acked else ""),
        "feeds_chip_state": "fault" if any(not f["acked"] for f in faults) else
        ("stale" if degraded or faults else "ok"),
        "asr_chip": "ASR", "disk_chip": None, "host_chip": None,
        "feeds_hero": f"FEEDS NOMINAL {healthy}/{len(feeds)}"
        + (f" · {worst['short']} · {worst['label']} {worst['in_state_label']}" if worst else ""),
        "feeds_hero_ranked": [{"feed_id": f["id"], "short": f["short"], "state": f["state"], "acked": f["acked"],
                               "label": f["label"], "since": f["since"], "in_state_label": f["in_state_label"]}
                              for f in ranked],
    }
    status_line = [f"{f['short']} · {f['label']} · SINCE {f['since']}" + (" · ACK'D" if f.get("acked") else "")
                   for f in faults + degraded]

    tracked = trains_at(runs, t)
    talking = {tx.train_id for tx in active if tx.train_id}
    positions = []
    for run, pos in tracked:
        chan = world.freqs[ROAD_CHANNEL[pos["prefix"]]]
        positions.append({
            "train_id": run.train_id, "operator": run.service.operator, "line": run.service.line,
            "direction": run.direction, **pos, "channel": f"CH{chan['aar_channel']:02d}",
            "talking": run.train_id in talking, "sim": True,
            "data_block": [f"{run.train_id} · SIM", f"{pos['mp_label'] or '≈ ' + str(pos['route_mi']) + ' MI'} · CH{chan['aar_channel']:02d}"],
        })
    ctc = {rid: {"trains": [{"train_id": p["train_id"], "route_mi": p["route_mi"], "talking": p["talking"]}
                            for p in positions if p["route_id"] == rid],
                 "detectors_talking": [tx.place_id for tx in active if tx.role == "detector"
                                       and route_point(world, rid, tx.place_id or "")]}
           for rid in world.routes}

    bank_ids = set(world.bank(spec["bank"])["frequency_ids"])
    recent = [row_view(world, tx, t, bank_ids) for tx in reversed(heard[-40:])]
    # History shows released key-ups only; a live one is the header chip until it ends (brief 9.2, 9.7)
    hist_rows = [tx for tx in heard if tx.t >= t - 3600 and tx.end <= t]
    hist_air = sum(tx.duration for tx in hist_rows)
    scrub = [0.0] * 1440
    for tx in history_rows:
        if tx.t <= t:
            scrub[min(1439, int((tx.t - (t - DAY)) // 60))] += aired(tx, t)
    lofar = {}
    for fid in world.feeds:
        cells: dict[int, dict[int, float]] = defaultdict(dict)
        for tx in heard:
            if tx.t < t - 3600:
                continue
            rec = next((r for r in tx.receptions if r["feed_id"] == fid), None)
            if rec:
                row = int((t - tx.t) // 30)
                ch = world.freqs[tx.channel]["aar_channel"]
                cells[ch][row] = max(cells[ch].get(row, -200), rec["rssi_dbfs"])
        lofar[fid] = {str(ch): sorted(rws.items()) for ch, rws in sorted(cells.items())}

    return {
        "scenario": name, "summary": spec["summary"], "sim": True, "generator": "tools/gen_sim.py",
        "seed": SEED, "date": SIM_DATE, "tz": TZ, "t_offset_s": t, "clock": hms(t), "clock_tenths": hms(t, True),
        "active_bank": spec["bank"], "displayed_feed": views[spec["bank"]]["displayed_feed"],
        "displayed_feed_admin": spec["admin_feed"], "displayed_feed_admin_why": spec["admin_feed_why"],
        "banks": [{k: b[k] for k in ("id", "name", "home_feed", "frequency_ids")} | {"sim": b.get("sim", False)}
                  for b in world.banks],
        "header": header, "status_line": status_line, "faults": faults, "degraded": degraded,
        "feeds": feeds, "system": system,
        "channels": channels, "views": views,
        "active_transmissions": [row_view(world, tx, t, bank_ids) | {
            "elapsed_s": round(t - tx.t, 1), "receptions": tx.receptions} for tx in active],
        "transcript": {"rows": recent, "count_today": sum(1 for tx in heard if tx.t >= 0)},
        "trains": {"tracked_count": len(positions), "positions": positions},
        "ctc": ctc,
        "map": map_counts(world, len(positions)),
        "history": {
            "range": {"start_t": t - 3600, "end_t": t, "start": hms(t - 3600)[:5], "end": hms(t)[:5]},
            "totals": {"count": len(hist_rows), "airtime_s": round(hist_air, 1),
                       "airtime_label": total_label(hist_air)},
            "hero": f"{hms(t - 3600)[:5]}–{hms(t)[:5]} EST · {len(hist_rows)} TRANSMISSIONS · "
                    f"{total_label(hist_air)} AIRTIME",
            "rows": [row_view(world, tx, t, bank_ids) for tx in reversed(hist_rows)],
            "trains": [train_record(run) for run in runs
                       if any(run.start + s <= t and run.end + s >= t - 3600 for s in (0, DAY, -DAY))],
            "scrubber_start_t": t - DAY, "scrubber_airtime_per_min": [round(v, 1) for v in scrub],
        },
        "stats": {
            "today": summary_stats(world, [tx for tx in heard if tx.t >= 0], kerchunks, health, 0, t),
            "rolling_24h": summary_stats(world, heard, kerchunks, health, t - DAY, t),
        },
        "lofar_60m": {"row_s": 30, "rows": 120, "row0": "newest", "cells": lofar},
    }


def system_moments(base: dict) -> dict:
    """Backend-link and app-start moments for system.html (brief 8.4-8.7), on top of ``base``."""
    t0 = base["t_offset_s"]
    attempts, at = [], 0
    while at <= max(SYSTEM_LINK_DROP_AGE_S.values()):
        at += SYSTEM_BACKOFF_S[min(len(attempts), len(SYSTEM_BACKOFF_S) - 1)]
        attempts.append(at)
    moments = {}
    for name, age in SYSTEM_LINK_DROP_AGE_S.items():
        n = next(i for i, a in enumerate(attempts) if a > age)
        moments[name] = {
            "drop_age_s": age, "drop_t": t0 - age, "drop_clock": hms(t0 - age),
            "retry_n": n + 1, "retry_in_s": attempts[n] - age,
            "system_down": age >= SYSTEM_NO_LINK_AFTER_S,
        }
    return {
        "scenario": "system", "sim": True, "generator": "tools/gen_sim.py", "seed": SEED, "date": SIM_DATE,
        "tz": TZ, "base_scenario": SYSTEM_BASE, "t_offset_s": t0, "clock": base["clock"],
        "summary": "App start, backend link drop (under and over 15 s) and an empty bank, at the listening moment.",
        "first_data_wait_s": SYSTEM_FIRST_DATA_WAIT_S,
        "backoff_s": SYSTEM_BACKOFF_S, "backoff_cap_s": SYSTEM_BACKOFF_S[-1],
        "retry_attempts_after_drop_s": attempts,
        "no_link_after_s": SYSTEM_NO_LINK_AFTER_S,
        "link_drop": moments,
        "empty_bank": SYSTEM_EMPTY_BANK,
    }


# --------------------------------------------------------------------------
# Health series
# --------------------------------------------------------------------------

def build_series(world: World, health: Health, rows: list[Tx], rng: random.Random) -> tuple[dict, dict]:
    feeds = {}
    for fid in world.feeds:
        static = FEED_STATIC[fid]
        s = defaultdict(list)
        for minute in range(1440):
            t = minute * 60 + 30
            st = health.state(fid, t)
            receiving = health.receiving(fid, t)
            s["state"].append(st["state"])
            s["snr_db"].append(round(22 + rng.gauss(0, 1.2), 1) if receiving else None)
            s["noise_floor_dbfs"].append(round(static["noise_floor_dbfs"] + rng.gauss(0, 0.6), 1) if receiving else None)
            rate = SAMPLE_RATE * (0.84 if "RATE" in st["label"] else 1.0) - abs(rng.gauss(0, 0.0015))
            s["sample_rate_msps"].append(round(rate, 4) if receiving else 0.0)
            s["last_sample_age_s"].append(round(health.last_sample_age(fid, t), 1))
            if static["driver"] == "sdrviz-agent":
                hour = minute / 60
                s["device_temp_c"].append(round(44 + 5 * math.sin((hour - 9) / 24 * 2 * math.pi) + rng.gauss(0, 0.4), 1))
                s["host_cpu_pct"].append(round(min(95, 18 + rng.gauss(0, 3)), 1))
                s["device_drops"].append(0 if receiving else None)
        feeds[fid] = dict(s)
    starts = [tx.t for tx in rows]
    system = {"host": defaultdict(list), "decoder": defaultdict(list), "disk": defaultdict(list)}
    for i in range(288):
        t = i * 300
        hour = t / 3600
        lo, hi = bisect.bisect_left(starts, t), bisect.bisect_left(starts, t + 300)
        window = rows[lo:hi]
        busy = sum(tx.duration for tx in window) / 300
        system["host"]["cpu_pct"].append(round(min(90, 21 + 60 * busy + rng.gauss(0, 2)), 1))
        system["host"]["soc_temp_c"].append(round(55 + 6 * math.sin((hour - 9) / 24 * 2 * math.pi) + 12 * busy
                                                  + rng.gauss(0, 0.5), 1))
        system["host"]["throttled"].append(False)
        system["host"]["under_voltage"].append(False)
        system["host"]["uptime_s"].append(1_814_400 + t)
        system["decoder"]["queue"].append(min(3, len(window) // 12))
        lat = [tx.latency for tx in window]
        system["decoder"]["median_latency_s"].append(round(statistics.median(lat), 1) if lat else None)
        system["disk"]["pct"].append(round(41.2 + 0.7 * t / DAY, 1))
    return feeds, {k: dict(v) for k, v in system.items()}


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------

def validate(world: World, health: Health, traffic: Traffic, runs: list[TrainRun], density: dict,
             scenarios: dict[str, dict]) -> list[str]:
    errors = []
    rows = traffic.rows
    place_ids, train_ids = set(world.places), {r.train_id for r in runs}

    # One key-up at a time per channel (rows and kerchunks).
    spans = defaultdict(list)
    for tx in rows:
        spans[tx.channel].append((tx.t, tx.end, tx.id))
    for k in traffic.kerchunks:
        spans[k["frequency_id"]].append((k["t_offset_s"], k["t_offset_s"] + k["duration_s"], k["id"]))
    for ch, sp in spans.items():
        sp.sort()
        for (a0, a1, ai), (b0, _, bi) in zip(sp, sp[1:]):
            if b0 < a1:
                errors.append(f"overlap on {ch}: {ai} and {bi}")

    # References, monitoring and police.
    for tx in rows:
        if tx.channel not in world.freqs or tx.channel not in world.monitored:
            errors.append(f"{tx.id}: channel {tx.channel} not a monitored seed channel")
        if "police" in tx.channel or "police" in (tx.speaker or "").lower() or "police" in tx.text.lower():
            errors.append(f"{tx.id}: police content")
        if tx.place_id and tx.place_id not in place_ids:
            errors.append(f"{tx.id}: unknown place {tx.place_id}")
        if tx.train_id and tx.train_id not in train_ids:
            errors.append(f"{tx.id}: unknown train {tx.train_id}")
        for r in tx.receptions:
            if tx.channel not in world.feeds[r["feed_id"]]["hears"]:
                errors.append(f"{tx.id}: {r['feed_id']} does not hear {tx.channel}")
            if not health.receiving(r["feed_id"], tx.t):
                errors.append(f"{tx.id}: {r['feed_id']} not receiving at {hms(tx.t)}")
        if tx.receptions and tx.receptions[0]["snr_db"] < max(r["snr_db"] for r in tx.receptions):
            errors.append(f"{tx.id}: primary is not the best reception")
        if tx.sim and TRAIN_NAME.search(tx.text) and not tx.train_id:
            errors.append(f"{tx.id}: names a passenger train but has no train_id")
    if any("police" in c for c in world.freqs):
        errors.append("police channel present in frequencies")

    # Seed rows kept verbatim.
    by_id = {tx.id: tx for tx in rows}
    for row in world.seed_rows:
        rec = tx_record(world, by_id[row["id"]])
        if any(rec[k] != v for k, v in row.items()):
            errors.append(f"{row['id']}: seed fields changed")

    # Seed rows naming a passenger train line up with its run.
    run_by_id = {r.train_id: r for r in runs}
    aligned = 0
    for tx in rows:
        if tx.sim or not tx.train_id:
            continue
        run = run_by_id.get(tx.train_id)
        if run is None:
            errors.append(f"{tx.id}: {tx.train_id} has no run")
            continue
        pos = run.position(tx.t) or run.position(tx.t + DAY) or run.position(tx.t - DAY)
        if pos is None:
            errors.append(f"{tx.id}: {tx.train_id} not running at {hms(tx.t)}")
            continue
        assert tx.speaker is not None  # seed rows always name a speaker
        crew_speaks = tx.train_id.split()[-1] in tx.speaker or "Auto Train" in tx.speaker
        if crew_speaks and tx.place_id:
            pts = [p for p in run.points if p["place_id"] == tx.place_id]
            if not pts:
                errors.append(f"{tx.id}: {tx.train_id} never passes {tx.place_id}")
            elif min(abs(p["route_mi"] - pos["route_mi"]) for p in pts) > 0.5:
                errors.append(f"{tx.id}: {tx.train_id} is {pos['route_mi']} mi, not at {tx.place_id}")
        aligned += 1
    if aligned < 25:
        errors.append(f"only {aligned} seed rows tied to trains")

    # SIM crew calls happen where the train is.
    for tx in rows:
        if tx.sim and tx.train_id and tx.role == "crew" and tx.place_id:
            run = run_by_id[tx.train_id]
            pos = run.position(tx.t)
            pts = [p for p in run.points if p["place_id"] == tx.place_id]
            if pos and pts and min(abs(p["route_mi"] - pos["route_mi"]) for p in pts) > 1.5:
                errors.append(f"{tx.id}: {tx.train_id} far from {tx.place_id}")

    # Train schedules are monotonic.
    for run in runs:
        times = [x for p in run.points for x in (p["arr"], p["dep"])]
        if times != sorted(times):
            errors.append(f"{run.train_id}: times not monotonic")

    # Density targets (brief 9.0.6).
    if not 1000 <= density["transmissions"] <= 1400:
        errors.append(f"transmissions {density['transmissions']} not about 1200")
    if not 1.5 <= density["airtime_h"] <= 2.5:
        errors.append(f"airtime {density['airtime_h']} h outside 1.5-2.5")
    if density["rush_overlap_pct"] < 8:
        errors.append(f"rush overlap {density['rush_overlap_pct']}% < 8%")
    for r in density["top8_rush_vs_midday"]:
        # None means midday was silent while the rush was not: an infinite ratio, which passes.
        if any(v is not None and v < 2 for v in (r["rush_over_midday_count"], r["rush_over_midday_airtime"])):
            errors.append(f"{r['frequency_id']}: rush/midday {r['rush_over_midday_count']} "
                          f"(airtime {r['rush_over_midday_airtime']}) < 2")

    # Scenario moments.
    lst = scenarios["listening"]
    if lst["active_transmissions"]:
        errors.append("listening: something is keyed")
    hero = lst["views"]["bank-nec"]["hero"]
    if hero.get("aar") != "CH54" or hero.get("age_label") != "42M":
        errors.append(f"listening: NEC hero is {hero}")
    keyed = scenarios["keyed"]
    act = {r["aar"]: r for r in keyed["active_transmissions"]}
    view = keyed["views"][keyed["active_bank"]]
    if not {"CH54", "CH08"} <= set(act) or len(act) != 3 or len(view["off_bank_active"]) != 1:
        errors.append(f"keyed: active set is {sorted(act)}")
    if view["hero"].get("aar4") != "5454" or view["hero"].get("timer") != "00:07.4":
        errors.append(f"keyed: hero is {view['hero']}")
    if any(f["state"] != "ok" for f in keyed["feeds"]):
        errors.append("keyed: a feed is not ok")
    for name, acked in (("fault", False), ("fault-acked", True)):
        fs = {f["id"]: f for f in scenarios[name]["feeds"]}
        if fs["feed-bay"]["state"] != "stale" or fs["feed-lnd"]["label"] != "FAULT · LINK LOST":
            errors.append(f"{name}: feed states wrong")
        if fs["feed-lnd"]["acked"] != acked:
            errors.append(f"{name}: LND-02 acked should be {acked}")
    if scenarios["fault"]["feeds"][3]["in_state_label"] != "1M 12S":
        errors.append("fault: BAY-04 should be STALE 1M 12S")
    return errors


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main() -> int:
    rng = random.Random(SEED)
    world = load_world()
    world.routes = build_routes(world)
    health = Health()
    runs = build_trains(world)
    traffic = generate_traffic(world, health, runs, rng)
    rows = traffic.rows

    day_stats = summary_stats(world, rows, traffic.kerchunks, health, 0, DAY)
    density = density_checks(world, rows, day_stats)
    series, system_series = build_series(world, health, rows, rng)

    scenarios = {}
    for name in SCENARIOS:
        scenarios[name] = snapshot(name, world, health, rows, traffic.kerchunks, runs, series, system_series)

    meta = {"generated_by": "tools/gen_sim.py", "seed": SEED, "date": SIM_DATE, "tz": TZ, "sim": True,
            "period": "24h, t_offset_s counted from 00:00:00 local; the day repeats"}
    routes = {"meta": meta | {"note": "Native mileposts; mp_approx values are derived from geometry (≈)."},
              "junctions": [{"place_id": "wash-union", "routes": ["r-nec", "r-capital", "r-metro"]},
                            {"place_id": "alexandria", "routes": ["r-nec", "r-manassas"]},
                            # Baltimore terminal tie (brief 9.1.6): the Philadelphia Sub leaves the NEC
                            # corridor at Baltimore, and the Capital Sub reaches it through Camden and the
                            # Howard Street Tunnel, so the strip's tie names every route it touches.
                            {"place_id": "baltimore-penn", "routes": ["r-nec", "r-capital", "r-phila"],
                             "note": "Baltimore terminal: r-capital joins via Camden / Howard Street Tunnel"}],
              "derived_points": [world.places[p] for p in DERIVED_POINTS],
              "routes": list(world.routes.values())}
    trains = {"meta": meta | {"note": "Passenger trains only (Amtrak, MARC, VRE). Freight is never positioned. "
                                      "Linear interpolation in track miles between points; t is arrival."},
              "count": len(runs), "trains": [train_record(r) for r in runs]}
    transmissions = {"meta": meta | {"count": len(rows), "seed_rows": sum(not tx.sim for tx in rows),
                                     "sim_rows": sum(tx.sim for tx in rows),
                                     "kerchunks": len(traffic.kerchunks)},
                     "transmissions": [tx_record(world, tx) for tx in rows],
                     "kerchunks": traffic.kerchunks}
    stats = {"meta": meta, "day": day_stats, "density": density}
    health_out = {"meta": meta | {"series_step_s": 60, "system_step_s": 300,
                                  "note": "Feeds are fictional. rtl_tcp feeds report no device telemetry."},
                  "feeds": {fid: {"short": feed_short(world.feeds[fid]), **FEED_STATIC[fid],
                                  "center_mhz": CENTER_MHZ, "sample_rate_msps": SAMPLE_RATE,
                                  "events": [{"t": clock(t), "clock": t, "state": s, "label": lbl}
                                             for t, s, lbl in FEED_EVENTS.get(fid, [])],
                                  "acks": [{"t": clock(t), "clock": t, "label": lbl}
                                           for f, t, lbl in FEED_ACKS if f == fid],
                                  "series_1m": series[fid]} for fid in world.feeds},
                  "system": system_series}
    banks = {"meta": meta, "banks": world.banks}

    outputs = {"routes.json": routes, "trains.json": trains, "transmissions.json": transmissions,
               "stats.json": stats, "health.json": health_out, "banks.json": banks}
    for fname, data in outputs.items():
        write_json(SIM_DIR / fname, data)
    write_js(SIM_DIR / "day.js", "window.SDRVIZ_DAY",
             {k.removesuffix(".json"): v for k, v in outputs.items()})
    for name, scn in scenarios.items():
        write_json(SIM_DIR / "scenarios" / f"{name}.json", scn)
        write_js(SIM_DIR / "scenarios" / f"{name}.js", f"window.SDRVIZ_SCENARIOS[{json.dumps(name)}]", scn,
                 prelude="window.SDRVIZ_SCENARIOS = window.SDRVIZ_SCENARIOS || {};\n")

    system = system_moments(scenarios[SYSTEM_BASE])
    write_json(SIM_DIR / "scenarios" / "system.json", system)
    write_js(SIM_DIR / "scenarios" / "system.js", 'window.SDRVIZ_SCENARIOS["system"]', system,
             prelude="window.SDRVIZ_SCENARIOS = window.SDRVIZ_SCENARIOS || {};\n")

    errors = validate(world, health, traffic, runs, density, scenarios)
    print(f"transmissions {density['transmissions']} (seed {transmissions['meta']['seed_rows']}), "
          f"airtime {density['airtime_h']} h, rush overlap {density['rush_overlap_pct']}%, "
          f"kerchunks {len(traffic.kerchunks)}, trains {len(runs)}")
    for r in density["top8_rush_vs_midday"]:
        print(f"  {r['frequency_id']:15} n={r['count']:4} rush/midday count {r['rush_over_midday_count']} "
              f"airtime {r['rush_over_midday_airtime']}")
    for name, scn in scenarios.items():
        view = scn["views"][scn["active_bank"]]
        print(f"  {name:11} {scn['clock']} keyed={[r['aar'] for r in scn['active_transmissions']]} "
              f"hero={view['hero'].get('line')} trains={scn['trains']['tracked_count']} "
              f"chip={scn['header']['feeds_chip']}")
    if errors:
        print(f"{len(errors)} validation error(s):")
        for e in errors[:60]:
            print("  -", e)
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
