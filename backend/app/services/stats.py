"""Analytics over the recorded day (a port of channel_stats / summary_stats in tools/gen_sim.py)."""

import math
import re
import statistics
from collections import Counter

from ..sim.health import Health
from ..sim.timefmt import DAY, aar4, hms, total_label
from ..sim.types import Tx, aired
from ..sim.world import World


def _bins(start: float, end: float, width: int) -> tuple[float, int]:
    first = math.floor(start / width) * width
    return first, math.ceil((end - first) / width)


def channel_stats(world: World, rows: list[Tx], kerchunks: list[dict], start: float, end: float) -> dict:
    h0, nh = _bins(start, end, 3600)
    m0, nm = _bins(start, end, 600)
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
            "frequency_id": cid,
            "label": freq.label,
            "aar_channel": freq.aar_channel,
            "aar4": aar4(freq.aar_channel),
            "monitored": bool(world.heard_by(cid)),
            "banks": world.banks_of(cid),
            "count": len(mine),
            "airtime_s": round(airtime, 1),
            "airtime_label": total_label(airtime),
            "airtime_share": round(airtime / total_air, 3) if total_air else 0.0,
            "avg_duration_s": round(airtime / len(mine), 1) if mine else None,
            "blips": sum(1 for k in kerchunks if k["frequency_id"] == cid and start <= k["t_offset_s"] < end),
            "counts_per_hour": counts,
            "airtime_per_hour": [round(a, 1) for a in air_h],
            "airtime_per_10min": [round(a, 1) for a in air_10],
            "busy_hours": [hms(h0 + i * 3600)[:2] for i in busy if counts[i]],
            "last_heard": {
                "tx_id": last.id,
                "t": round(last.t, 1),
                "clock": hms(last.t),
                "end_t": round(last.end, 1),
            }
            if last
            else None,
        }
    return {
        "start_t": round(start, 1),
        "end_t": round(end, 1),
        "start": hms(start),
        "end": hms(end),
        "hour_bins_start_t": h0,
        "hour_labels": [hms(h0 + i * 3600)[:2] for i in range(nh)],
        "ten_min_bins_start_t": m0,
        "channels": per,
    }


def summary_stats(
    world: World, rows: list[Tx], kerchunks: list[dict], health: Health, start: float, end: float
) -> dict:
    ch = channel_stats(world, rows, kerchunks, start, end)
    total_air = sum(aired(tx, end) for tx in rows)
    busiest = max(ch["channels"].values(), key=lambda c: c["airtime_s"])
    talkers = Counter(tx.train_id or tx.speaker for tx in rows if tx.speaker or tx.train_id)
    finals = [tx for tx in rows if tx.state == "final" and tx.confidence is not None]
    hist = [0] * 10
    for tx in finals:
        hist[min(9, int(tx.confidence * 10))] += 1

    detectors = []
    for pid, det in world.places.items():
        if det.get("kind") != "detector":
            continue
        reports = [tx for tx in rows if tx.place_id == pid and tx.role == "detector"]
        last = reports[-1] if reports else None
        detectors.append(
            {
                "detector_id": pid,
                "name": det["name"],
                "mp_label": re.sub(r"([A-Z]+)(\d)", r"\1 \2", det["milepost"]),
                "frequency_id": det["frequency_id"],
                "reports": len(reports),
                "defects": sum(1 for tx in reports if tx.detector and tx.detector["defect"]),
                "last": {
                    "tx_id": last.id,
                    "clock": hms(last.t),
                    "axles": last.detector["axles"],
                    "mph": last.detector["mph"],
                    "defect": last.detector["defect"],
                }
                if last
                else None,
            }
        )
    return {
        **ch,
        "totals": {
            "count": len(rows),
            "airtime_s": round(total_air, 1),
            "airtime_label": total_label(total_air),
            "blips": sum(c["blips"] for c in ch["channels"].values()),
        },
        "busiest": {
            "frequency_id": busiest["frequency_id"],
            "aar": f"CH{busiest['aar_channel']:02d}",
            "label": busiest["label"],
            "share": busiest["airtime_share"],
            "share_label": f"{round(busiest['airtime_share'] * 100)}%",
        },
        "top_channels": [
            c["frequency_id"] for c in sorted(ch["channels"].values(), key=lambda c: -c["airtime_s"])[:10]
        ],
        "top_talkers": [{"name": n, "count": c} for n, c in talkers.most_common(10)],
        "detectors": detectors,
        "decoder": {
            "engine": "moonshine (SIM)",
            "final_rows": len(finals),
            "confidence_histogram": hist,
            "confidence_bins": [round(i / 10, 1) for i in range(11)],
            "median_latency_s": round(statistics.median(tx.latency for tx in rows), 1) if rows else None,
        },
        "feed_uptime": {fid: health.spans(fid, start, end) for fid in world.feeds},
    }


def stats_for(world: World, day, kerchunks: list[dict], health: Health, range_name: str, t: float) -> dict:
    """The StatsView for `today` (day so far), `yesterday` (the full recorded day) or `rolling_24h`."""
    if range_name == "yesterday":
        rows = [tx for tx in day.rows if tx.channel in world.freqs]
        return summary_stats(world, rows, kerchunks, health, 0, DAY)
    heard = [tx for tx in day.window(t - DAY, t + 0.001) if tx.t <= t and tx.channel in world.freqs]
    if range_name == "today":
        return summary_stats(world, [tx for tx in heard if tx.t >= 0], kerchunks, health, 0, t)
    return summary_stats(world, heard, kerchunks, health, t - DAY, t)
