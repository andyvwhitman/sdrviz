"""Extract the data behind design/mockups/components.html.

Run from the repo root:

    python3 design/mockups/components-data.py

Writes design/mockups/components-data.js (window.SDRVIZ_COMPONENTS). Nothing in
data/sim/ is written.

Every number on the component sheet comes from here, and everything here comes
from data/sim/ or from tools/gen_sim.py's own ``snapshot()``:

* The four scenario moments are read verbatim from data/sim/scenarios/*.json.
  The script first checks that ``snapshot()`` reproduces each file exactly, so
  the generator is a faithful source for the extra moments below.
* Six extra moments are snapshots at times where a tile state the sheet needs
  really occurs in the simulated day (squelch-open, the commit flash, partial
  coverage during TX, a reconnecting feed, a degraded feed chip, recent + stale).
* Transcript rows are read verbatim from data/sim/transmissions.json.
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))

import gen_sim as g  # noqa: E402  (path set above)

SIM = ROOT / "data" / "sim"
OUT = Path(__file__).with_name("components-data.js")

CANONICAL = ["listening", "keyed", "fault", "fault-acked"]

# Channels the sheet draws; their 60-minute sparklines are computed per minute.
SHEET_CHANNELS = ["amtk-nec-road", "csx-road", "csx-be-disp", "amtk-k-tower", "amtk-auto-train",
                  "amtk-mow-47", "csx-landover", "ns-hag-disp"]

# Transcript rows shown on the sheet (ids in data/sim/transmissions.json).
ROW_IDS = ["sim-0648", "sim-0649", "sim-0647", "sim-0650", "sim-0646", "sim-0652",
           "sim-0633", "sim-0223", "tx-001", "tx-064", "sim-0644", "sim-0645"]
KERCHUNK_ID = "kc-040"


def build():
    rng = random.Random(g.SEED)
    world = g.load_world()
    world.routes = g.build_routes(world)
    health = g.Health()
    runs = g.build_trains(world)
    traffic = g.generate_traffic(world, health, runs, rng)
    rows = traffic.rows
    series, system_series = g.build_series(world, health, rows, rng)
    return world, health, runs, traffic, rows, series, system_series


def spark60(rows, channel: str, t: float) -> list[float]:
    """M22 at 1-minute resolution, by gen_sim's own rule (a key-up's full duration counts in the
    minute it started; anything heard by t), so every 5 columns sum to the scenario's spark_60m."""
    cols = [0.0] * 60
    for tx in rows:
        if tx.channel == channel and t - 3600 <= tx.t <= t:
            cols[min(59, int((tx.t - (t - 3600)) // 60))] += tx.duration
    return [round(c, 1) for c in cols]


def check_spark(scn: dict, spark: dict) -> list[str]:
    """Each 5-column group must equal the shipped 12 x 5-minute spark_60m."""
    bad = []
    for c in scn["channels"]:
        if c["id"] in spark:
            fives = [round(sum(spark[c["id"]][i:i + 5]), 1) for i in range(0, 60, 5)]
            if any(abs(a - b) > 0.15 for a, b in zip(fives, c["spark_60m"])):
                bad.append(f'{scn["scenario"]}:{c["id"]} {fives} != {c["spark_60m"]}')
    return bad


def trim(scn: dict, spark_rows, t: float) -> dict:
    keep = ["scenario", "summary", "clock", "clock_tenths", "active_bank", "displayed_feed", "header",
            "status_line", "faults", "degraded", "system"]
    out = {k: scn.get(k) for k in keep}
    out["t"] = t
    out["feeds"] = scn["feeds"]
    out["channels"] = {c["id"]: c for c in scn["channels"]}
    out["spark"] = {cid: spark60(spark_rows, cid, t) for cid in SHEET_CHANNELS}
    out["view"] = scn["views"][scn["active_bank"]]
    return out


def main() -> int:
    world, health, runs, traffic, rows, series, system_series = build()
    args = (world, health, rows, traffic.kerchunks, runs, series, system_series)

    moments, verified = {}, {}
    for name in CANONICAL:
        shipped = json.loads((SIM / "scenarios" / f"{name}.json").read_text())
        again = json.loads(json.dumps(g.snapshot(name, *args), default=str))
        verified[name] = again == shipped
        moments[name] = trim(shipped, rows, g.clock(shipped["clock_tenths"]))
        moments[name]["source"] = f"data/sim/scenarios/{name}.json"
        bad = check_spark(shipped, moments[name]["spark"])
        if bad:
            print("sparkline does not match spark_60m:", *bad, sep="\n  ")
            return 1
    if not all(verified.values()):
        print("generator does not reproduce the shipped scenarios:", verified)
        return 1

    tx_by_id = {tx.id: tx for tx in rows}
    extra = {
        # sim-0648 (CH54, MARC 433) crosses squelch at 14:07:22.6; 100 ms later it is squelch-open,
        # 250 ms later it commits (brief 7.3).
        "squelch": (tx_by_id["sim-0648"].t + 0.1, "bank-commuter", "sim-0648 + 100 ms: squelch open, not yet committed"),
        "flash": (tx_by_id["sim-0648"].t + 0.25, "bank-commuter", "sim-0648 + 250 ms: TX commit, the 120 ms flash frame"),
        # sim-0644 (CH08) is heard by BWI-03 only: LND-02 is reconnecting and BAY-04 has gone stale.
        "partial-tx": (tx_by_id["sim-0644"].t + 6.0, "bank-commuter", "sim-0644 + 6.0 s: CH08 keyed on 1 of 3 feeds"),
        # LND-02 is offline (RECONNECTING) 14:05:00-14:06:00 (health.json events).
        "reconnect": (g.clock("14:05:30"), "bank-freight", "LND-02 RECONNECTING (health.json 14:05:00)"),
        # ALX-01 is stale 09:31:20-09:33:05 with nothing else wrong: the FEEDS chip is degraded, not fault.
        "degraded": (g.clock("09:32:00"), "bank-nec", "ALX-01 STALE · RATE 84% (health.json 09:31:20)"),
        # The only true recent + stale in the day: NS DISP (CH09, ALX-01 only) last spoke at 09:32:04,
        # inside ALX-01's stale window. (BAY-04's NO SAMPLES windows only meet recent-dim embers.)
        "recent-stale": (g.clock("09:33:00"), "bank-freight", "NS DISP ember during ALX-01 STALE · RATE 84%"),
    }
    for name, (t, bank, why) in extra.items():
        home = world.bank(bank)["home_feed"]
        g.SCENARIOS[name] = {"t": g.hms(t, tenths=True), "bank": bank, "summary": why,
                             "admin_feed": home, "admin_feed_why": "Component sheet moment: the bank's home feed."}
        scn = json.loads(json.dumps(g.snapshot(name, *args), default=str))
        moments[name] = trim(scn, rows, t)
        moments[name]["source"] = f"tools/gen_sim.py snapshot() @ {g.hms(t, tenths=True)} · {why}"

    shipped_rows = {r["id"]: r for r in json.loads((SIM / "transmissions.json").read_text())["transmissions"]}
    kerchunks = {k["id"]: k for k in json.loads((SIM / "transmissions.json").read_text())["kerchunks"]}
    places = json.loads((ROOT / "data" / "seed" / "places.json").read_text())
    place_mp = {p["id"]: p.get("milepost") for kind in ("stations", "landmarks", "detectors", "feeds")
                for p in places[kind]}
    routes = json.loads((SIM / "routes.json").read_text())
    mp_points = {f'{r["id"]}:{p["place_id"]}': {"name": p["name"], "label": p["mp_label"], "approx": p["mp_approx"],
                                                "prefix": p["prefix"], "mp": p["mp"], "route": r["id"]}
                 for r in routes["routes"] for p in r["points"] if p["mp_label"]}

    data = {
        "meta": {"generated_by": "design/mockups/components-data.py", "seed": g.SEED, "date": g.SIM_DATE,
                 "verified_against_shipped": verified},
        "moments": moments,
        "rows": {i: shipped_rows[i] for i in ROW_IDS},
        "kerchunk": kerchunks[KERCHUNK_ID],
        "place_mp": {pid: place_mp.get(shipped_rows[i]["place_id"]) for i in ROW_IDS
                     for pid in [shipped_rows[i]["place_id"]] if pid},
        "mp_points": mp_points,
        "trains": json.loads((SIM / "scenarios" / "keyed.json").read_text())["trains"]["positions"],
        "map": json.loads((SIM / "scenarios" / "keyed.json").read_text())["map"],
    }
    OUT.write_text("/* generated by design/mockups/components-data.py; do not edit */\n"
                   "window.SDRVIZ_COMPONENTS = " + json.dumps(data, ensure_ascii=False) + ";\n")
    print("wrote", OUT.relative_to(ROOT), f"{OUT.stat().st_size / 1024:.0f} KB")
    print("verified", verified)
    for name, m in moments.items():
        print(f"  {name:13} {m['clock_tenths']}  {m['header']['feeds_chip']:22} {m['source']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
