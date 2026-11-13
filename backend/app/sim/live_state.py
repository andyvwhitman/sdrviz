"""LiveState: everything a screen shows at one instant, built from the recorded day.

A port of the `snapshot()` family in tools/gen_sim.py (the generator is not imported). The
result is JSON-shaped; tests/test_golden.py compares it with data/sim/scenarios/*.json.
Omitted compared with a scenario file (they have their own endpoints): `summary`, `generator`,
`history`, `stats`, `map`.
"""

from collections import defaultdict
from dataclasses import dataclass

from .data import SimData
from .health import Health
from .scenarios import ScenarioSpec
from .timefmt import DAY, SIM_DATE, TZ, aar4, age_label, hms
from .trains import trains_at
from .types import ROLE_TAGS, Tx
from .world import World

CHANNEL_RANGES = {"recent": 120, "recent-dim": 600}
LOFAR_ROW_S = 30
LOFAR_ROWS = 120
SPARK_BINS = 60  # per-minute bins over the last hour
RTL_TCP_NA = ["device_temp_c", "host_cpu_pct", "host_temp_c", "device_drops"]

# Road channel by milepost prefix: the channel a positioned train is shown on.
ROAD_CHANNEL = {
    "CFP": "csx-rfp-road",
    "NEC": "amtk-nec-road",
    "BAA": "csx-road",
    "BA": "csx-road",
    None: "ns-road",
    "BAK": "csx-road",
}


@dataclass
class SimInputs:
    """The three things `build` reads: the editable world, the replayed day and feed health."""

    world: World
    data: SimData
    health: Health


# ---------------------------------------------------------------------------
# Rows
# ---------------------------------------------------------------------------


def row_view(world: World, tx: Tx, t: float, bank_ids: set[str]) -> dict:
    live = tx.t <= t < tx.end
    decoding = live or (tx.end <= t < tx.end + tx.latency)
    freq = world.freqs[tx.channel]
    more = len(tx.receptions) - 1
    return {
        "id": tx.id,
        "t_offset_s": round(tx.t, 1),
        "clock": hms(tx.t),
        "clock_tenths": hms(tx.t, tenths=True),
        "aar": f"CH{freq.aar_channel:02d}",
        "aar4": aar4(freq.aar_channel),
        "frequency_id": tx.channel,
        "label": freq.label,
        "off_bank": tx.channel not in bank_ids,
        "feed_id": tx.feed,
        "feed_label": world.feed_short(tx.feed) + (f" +{more}" if more else ""),
        "role": tx.role,
        "role_tag": ROLE_TAGS.get(tx.role, "UNK"),
        "speaker": tx.speaker,
        "train_id": tx.train_id,
        "place_id": tx.place_id,
        "duration_s": tx.duration,
        "state": "decoding" if decoding else tx.state,
        "final_state": tx.state,
        "live": live,
        "transcript": "" if decoding else tx.text,
        "words": [] if decoding else list(tx.words),
        "confidence": None if decoding else tx.confidence,
        "detector": tx.detector,
        "sim": tx.sim,
    }


# ---------------------------------------------------------------------------
# Channels and banks
# ---------------------------------------------------------------------------


def coverage(world: World, health: Health, channel: str, t: float) -> dict:
    pips = [
        {"feed_id": fid, "short": world.feed_short(fid), "state": health.state(fid, t)["state"]}
        for fid in world.heard_by(channel)
    ]
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
    return {
        "state": state,
        "healthy": healthy,
        "total": len(pips),
        "label": f"{healthy}/{len(pips)} FEEDS" if state == "partial" else None,
        "pips": pips,
    }


def stale_readout(health: Health, pips: list[dict], t: float) -> str:
    """Tile status readout for a stale channel (spec 5.5).

    A feed that is stale on sample rate still delivers samples, so its age is about zero and
    "AGE 0S" would read as a dead zero. When every unhealthy feed is rate-stale the readout
    carries the rate instead ("RATE 84%"); otherwise it is the age of the freshest silent feed.
    """
    causes = [(p, health.state(p["feed_id"], t)) for p in pips if p["state"] != "ok"]
    rate = [
        st["label"].replace("STALE · ", "")
        for p, st in causes
        if st["state"] == "stale" and "RATE" in st["label"] and health.receiving(p["feed_id"], t)
    ]
    if rate and len(rate) == len(causes):
        return rate[0]
    silent = [p for p in pips if not health.receiving(p["feed_id"], t)] or pips
    return "AGE " + age_label(min(health.last_sample_age(p["feed_id"], t) for p in silent), "age")


def channel_view(inputs: SimInputs, cid: str, t: float) -> dict:
    world, health, day = inputs.world, inputs.health, inputs.data.day
    freq = world.freqs[cid]
    mine = [tx for tx in day.channel_window(cid, t - DAY, t + 0.001) if tx.t <= t]
    done = [tx for tx in mine if tx.end <= t]
    now = next((tx for tx in mine if tx.end > t), None)
    last = done[-1] if done else None
    cov = coverage(world, health, cid, t)
    since_last = t - last.end if last else None

    if now:
        state = "tx"
    elif last and since_last < CHANNEL_RANGES["recent"]:
        state = "recent"
    elif last and since_last < CHANNEL_RANGES["recent-dim"]:
        state = "recent-dim"
    else:
        state = "idle"

    if now:
        readout = None  # the promoted TX timer takes the zone
    elif cov["state"] == "offline":
        all_offline = cov["pips"] and all(health.state(p["feed_id"], t)["state"] == "offline" for p in cov["pips"])
        readout = "RECONNECTING" if all_offline else "NO FEEDS"
    elif cov["state"] == "stale":
        readout = stale_readout(health, cov["pips"], t)
    elif last and since_last < CHANNEL_RANGES["recent-dim"]:
        readout = "LAST " + age_label(since_last)
    else:
        readout = None

    spark = [0.0] * SPARK_BINS
    for tx in mine:
        if tx.t >= t - 3600:
            spark[min(SPARK_BINS - 1, int((tx.t - (t - 3600)) // 60))] += round(tx.duration, 1)

    return {
        "id": cid,
        "label": freq.label,
        "aar": f"CH{freq.aar_channel:02d}",
        "aar4": aar4(freq.aar_channel),
        "freq_mhz": freq.freq_mhz,
        "railroad": freq.railroad,
        "use": freq.use,
        "monitored": bool(world.heard_by(cid)),
        "banks": world.banks_of(cid),
        "heard_by": world.heard_by(cid),
        "coverage": cov,
        "state": state,
        "status_readout": readout,
        "channel_fault": None,
        "tx": {
            "tx_id": now.id,
            "elapsed_s": round(t - now.t, 1),
            "timer": f"{int((t - now.t) // 60):02d}:{(t - now.t) % 60:04.1f}",
            "primary_feed": now.feed,
            "via": world.feed_short(now.feed),
            "receptions": list(now.receptions),
            "train_id": now.train_id,
        }
        if now
        else None,
        "last_heard": {
            "tx_id": last.id,
            "end_t": round(last.end, 1),
            "clock": hms(last.t),
            "age_s": round(since_last, 1),
            "age_label": age_label(since_last),
            "via": world.feed_short(last.feed),
        }
        if last
        else None,
        "spark_60m": [round(v, 1) for v in spark],
    }


def channel_views(inputs: SimInputs, t: float) -> list[dict]:
    return [channel_view(inputs, cid, t) for cid in inputs.world.freqs]


def bank_views(world: World, channels: list[dict], active_bank: str, displayed_feed: str | None) -> dict[str, dict]:
    by_id = {c["id"]: c for c in channels}
    views = {}
    for bank in world.banks:
        ids = [c for c in bank.frequency_ids if c in by_id]
        id_set = set(ids)
        keyed = sorted((by_id[c] for c in ids if by_id[c]["tx"]), key=lambda c: -c["tx"]["elapsed_s"])
        off = [c for c in channels if c["tx"] and c["id"] not in id_set]
        last_in_bank = max(
            (c for c in channels if c["id"] in id_set and c["last_heard"]),
            key=lambda c: c["last_heard"]["end_t"],
            default=None,
        )
        disp = displayed_feed if bank.id == active_bank and displayed_feed else bank.home_feed
        not_on_disp = [c for c in channels if c["tx"] and all(r["feed_id"] != disp for r in c["tx"]["receptions"])]
        hero: dict = {"mode": "keyed" if keyed else "idle"}
        if keyed:
            h = keyed[0]
            others = [c["aar4"] for c in keyed[1:]]
            hero |= {
                "aar4": h["aar4"],
                "label": h["label"],
                "via": h["tx"]["via"],
                "timer": h["tx"]["timer"],
                "line": f"KEYED · VIA {h['tx']['via']}",
                "others": others,
                "others_label": f"+{len(others)} · " + " · ".join(others) if others else None,
            }
        elif last_in_bank:
            lh = last_in_bank["last_heard"]
            hero |= {
                "age_label": lh["age_label"],
                "aar": last_in_bank["aar"],
                "label": last_in_bank["label"],
                "line": f"LAST KEY-UP {lh['age_label']} AGO · {last_in_bank['aar']} · {last_in_bank['label']}",
            }
        vias = sorted({c["tx"]["via"] for c in not_on_disp})
        views[bank.id] = {
            "bank_id": bank.id,
            "name": bank.name,
            "short": bank.short,
            "tile_ids": list(bank.frequency_ids),
            "tile_count": len(bank.frequency_ids),
            "hero": hero,
            "displayed_feed": disp,
            "displayed_feed_label": f"FEED · {world.feed_short(disp)}",
            "off_bank_active": [c["aar4"] for c in off],
            "off_bank_label": f"+{len(off)} OFF-BANK · " + " · ".join(c["aar4"] for c in off) if off else None,
            "not_on_displayed_feed": [{"aar4": c["aar4"], "feed": c["tx"]["via"]} for c in not_on_disp],
            "selector_extra_label": f"+{len(not_on_disp)} ON " + " · ".join(vias) if not_on_disp else None,
        }
    return views


# ---------------------------------------------------------------------------
# Feeds, faults, header
# ---------------------------------------------------------------------------


def feed_view(inputs: SimInputs, fid: str, t: float) -> dict:
    feed, health = inputs.world.feeds[fid], inputs.health
    st = health.state(fid, t)
    series = inputs.data.feed_series.get(fid, {})
    minute = int((t % DAY) // 60)
    age = health.last_sample_age(fid, t)

    def at(key: str, offset: int = 0):
        values = series.get(key)
        return values[(minute + offset) % 1440] if values else None

    degraded = st["state"] != "ok"
    telemetry = None
    if feed.driver == "sdrviz-agent" and series:
        telemetry = {k: at(k) for k in ("device_temp_c", "host_cpu_pct", "device_drops")}
    return {
        "id": fid,
        "short": feed.short,
        "name": feed.name,
        "site": feed.site,
        "lat": feed.lat,
        "lon": feed.lon,
        "coverage_radius_km": feed.coverage_radius_km,
        "hears": list(feed.hears),
        "driver": feed.driver + (" · SIM" if feed.driver_sim else ""),
        "host": feed.host,
        "port": feed.port,
        "sim": feed.sim,
        "enabled": feed.enabled,
        "state": st["state"],
        "label": st["label"],
        "since_t": st["since"] if degraded else None,
        "since": hms(st["since"]) if degraded else None,
        "in_state_s": round(t % DAY - st["since"], 1) if degraded else None,
        "in_state_label": age_label(t % DAY - st["since"], "age") if degraded else None,
        "episode_start": hms(st["episode_start"]) if st["episode_start"] is not None else None,
        "acked": st["acked"],
        "acked_at": hms(st["acked_at"]) if st["acked_at"] else None,
        "last_sample_age_s": round(age, 1),
        "last_sample_age_label": age_label(age, "age") if age >= 1 else None,
        "center_mhz": feed.center_mhz,
        "sample_rate_msps": feed.sample_rate_msps,
        "sample_rate_measured_msps": None if health.link_down(fid, t) else at("sample_rate_msps"),
        "gain_db": feed.gain_db,
        "ppm": feed.ppm,
        "snr_db": at("snr_db"),
        "noise_floor_dbfs": at("noise_floor_dbfs"),
        "telemetry": telemetry,
        "telemetry_na": RTL_TCP_NA if telemetry is None else [],
        "sample_rate_15m": [
            None if health.link_down(fid, t - (14 - i) * 60) else at("sample_rate_msps", i - 14) for i in range(15)
        ],
    }


def feed_severity(feed: dict) -> int:
    """Feeds hero order: unacked fault, acked fault, offline, stale."""
    if feed["state"] == "fault":
        return 1 if feed["acked"] else 0
    return {"offline": 2, "stale": 3}.get(feed["state"], 9)


def health_summary(feeds: list[dict]) -> dict:
    """`header`, `status_line`, `faults` and `degraded`: the server owns fault bookkeeping."""
    faults = [
        {
            "object": f["id"],
            "kind": "feed",
            "short": f["short"],
            "state": f["state"],
            "label": f["label"],
            "since": f["since"],
            "acked": f["acked"],
            "acked_at": f["acked_at"],
        }
        for f in feeds
        if f["state"] == "fault"
    ]
    degraded = [
        {
            "object": f["id"],
            "kind": "feed",
            "short": f["short"],
            "state": f["state"],
            "label": f["label"],
            "since": f["since"],
            "in_state_label": f["in_state_label"],
        }
        for f in feeds
        if f["state"] in ("stale", "offline")
    ]
    healthy = sum(f["state"] == "ok" for f in feeds)
    acked = sum(f["acked"] for f in faults)
    ranked = sorted((f for f in feeds if f["enabled"] and f["state"] != "ok"), key=feed_severity)
    worst = ranked[0] if ranked else None
    header = {
        "feeds_chip": f"FEEDS {healthy}/{len(feeds)}" + (f" · {acked} ACK'D" if acked else ""),
        "feeds_chip_state": "fault"
        if any(not f["acked"] for f in faults)
        else ("stale" if degraded or faults else "ok"),
        "asr_chip": "ASR",
        "disk_chip": None,
        "host_chip": None,
        "feeds_hero": f"FEEDS NOMINAL {healthy}/{len(feeds)}"
        + (f" · {worst['short']} · {worst['label']} {worst['in_state_label']}" if worst else ""),
        "feeds_hero_ranked": [
            {
                "feed_id": f["id"],
                "short": f["short"],
                "state": f["state"],
                "acked": f["acked"],
                "label": f["label"],
                "since": f["since"],
                "in_state_label": f["in_state_label"],
            }
            for f in ranked
        ],
    }
    status_line = [
        f"{f['short']} · {f['label']} · SINCE {f['since']}" + (" · ACK'D" if f.get("acked") else "")
        for f in faults + degraded
    ]
    return {"header": header, "status_line": status_line, "faults": faults, "degraded": degraded}


def system_block(data: SimData, t: float) -> dict:
    """Host, decoder and disk readings (5 minute steps)."""
    step = int((t % DAY) // 60) // 5
    return {
        name: {key: values[step] for key, values in series.items() if isinstance(values, list)} | {"state": "ok"}
        for name, series in data.system_series.items()
    }


def admin_feed(feeds: list[dict], displayed: str, scenario: ScenarioSpec | None) -> tuple[str, str]:
    """The feed the Feeds & Banks inspector opens on, and why."""
    if scenario:
        return scenario.admin_feed, scenario.admin_feed_why
    ranked = health_summary(feeds)["header"]["feeds_hero_ranked"]
    if ranked:
        worst = ranked[0]
        why = "The acked fault is still the worst feed." if worst["acked"] else "The worst feed is inspected first."
        return worst["feed_id"], why
    return displayed, "Nothing is off: the active bank's home feed."


# ---------------------------------------------------------------------------
# Trains
# ---------------------------------------------------------------------------


def train_positions(inputs: SimInputs, t: float, talking: set[str]) -> list[dict]:
    positions = []
    for run, pos in trains_at(inputs.data.runs, t):
        chan = inputs.world.freqs.get(ROAD_CHANNEL.get(pos["prefix"], ""))
        aar = f"CH{chan.aar_channel:02d}" if chan else "CH--"
        positions.append(
            {
                "train_id": run.train_id,
                "operator": run.operator,
                "line": run.line,
                "direction": run.direction,
                **pos,
                "channel": aar,
                "talking": run.train_id in talking,
                "sim": True,
                "data_block": [
                    f"{run.train_id} · SIM",
                    f"{pos['mp_label'] or '≈ ' + str(pos['route_mi']) + ' MI'} · {aar}",
                ],
            }
        )
    return positions


def ctc_state(world: World, positions: list[dict], active: list[Tx]) -> dict:
    detectors = [tx.place_id for tx in active if tx.role == "detector"]
    ctc = {}
    for rid, route in world.routes.items():
        route_places = {p["place_id"] for p in route["points"]}
        ctc[rid] = {
            "trains": [
                {"train_id": p["train_id"], "route_mi": p["route_mi"], "talking": p["talking"]}
                for p in positions
                if p["route_id"] == rid
            ],
            "detectors_talking": [pid for pid in detectors if pid in route_places],
        }
    return ctc


def trains_block(inputs: SimInputs, t: float, active: list[Tx]) -> tuple[list[dict], dict]:
    talking = {tx.train_id for tx in active if tx.train_id}
    positions = train_positions(inputs, t, talking)
    return positions, ctc_state(inputs.world, positions, active)


# ---------------------------------------------------------------------------
# LOFAR
# ---------------------------------------------------------------------------


def lofar_history(inputs: SimInputs, t: float) -> dict:
    """The last hour of per-channel signal strength: {feed: {aar: [[row, dbfs], ...]}}, row 0 newest."""
    recent = [
        tx for tx in inputs.data.day.window(t - 3600, t + 0.001) if tx.t <= t and tx.channel in inputs.world.freqs
    ]
    lofar = {}
    for fid in inputs.world.feeds:
        cells: dict[int, dict[int, float]] = defaultdict(dict)
        for tx in recent:
            rec = next((r for r in tx.receptions if r["feed_id"] == fid), None)
            if rec:
                row = int((t - tx.t) // LOFAR_ROW_S)
                ch = inputs.world.freqs[tx.channel].aar_channel
                cells[ch][row] = max(cells[ch].get(row, -200), rec["rssi_dbfs"])
        lofar[fid] = {str(ch): sorted(rows.items()) for ch, rows in sorted(cells.items())}
    return {"row_s": LOFAR_ROW_S, "rows": LOFAR_ROWS, "row0": "newest", "cells": lofar}


def lofar_row(inputs: SimInputs, start: float, end: float) -> dict:
    """One LOFAR row: the strongest reception per feed and channel for key-ups starting in [start, end)."""
    cells: dict[str, dict[str, float]] = defaultdict(dict)
    for tx in inputs.data.day.window(start, end):
        if tx.channel not in inputs.world.freqs:
            continue
        for rec in tx.receptions:
            row = cells[rec["feed_id"]]
            row[tx.channel] = max(row.get(tx.channel, -200), rec["rssi_dbfs"])
    return dict(cells)


# ---------------------------------------------------------------------------
# The whole state
# ---------------------------------------------------------------------------


def build(
    inputs: SimInputs,
    t: float,
    bank_id: str,
    displayed_feed: str | None = None,
    scenario: ScenarioSpec | None = None,
    speed: float = 1.0,
) -> dict:
    """The LiveState at clock time `t` with `bank_id` active."""
    world, data = inputs.world, inputs.data
    t %= DAY
    channels = channel_views(inputs, t)
    views = bank_views(world, channels, bank_id, displayed_feed)
    feeds = [feed_view(inputs, fid, t) for fid in world.feeds]
    summary = health_summary(feeds)

    heard = [tx for tx in data.day.window(t - DAY, t + 0.001) if tx.t <= t and tx.channel in world.freqs]
    active = [tx for tx in heard if tx.end > t]
    bank_ids = set(world.bank(bank_id).frequency_ids)
    positions, ctc = trains_block(inputs, t, active)
    displayed = views[bank_id]["displayed_feed"]
    admin_id, admin_why = admin_feed(feeds, displayed, scenario)

    return {
        "scenario": scenario.name if scenario else None,
        "sim": True,
        "speed": speed,
        "date": SIM_DATE,
        "tz": TZ,
        "t_offset_s": t,
        "clock": hms(t),
        "clock_tenths": hms(t, True),
        "active_bank": bank_id,
        "displayed_feed": displayed,
        "displayed_feed_admin": admin_id,
        "displayed_feed_admin_why": admin_why,
        "banks": [
            {
                "id": b.id,
                "name": b.name,
                "short": b.short,
                "home_feed": b.home_feed,
                "frequency_ids": list(b.frequency_ids),
                "sim": b.sim,
            }
            for b in world.banks
        ],
        **summary,
        "feeds": feeds,
        "system": system_block(data, t),
        "channels": channels,
        "views": views,
        "active_transmissions": [
            row_view(world, tx, t, bank_ids) | {"elapsed_s": round(t - tx.t, 1), "receptions": list(tx.receptions)}
            for tx in active
        ],
        "transcript": {
            "rows": [row_view(world, tx, t, bank_ids) for tx in reversed(heard[-40:])],
            "count_today": sum(1 for tx in heard if tx.t >= 0),
        },
        "trains": {"tracked_count": len(positions), "positions": positions},
        "ctc": ctc,
        "lofar_60m": lofar_history(inputs, t),
    }
