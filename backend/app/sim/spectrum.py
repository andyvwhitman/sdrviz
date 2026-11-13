"""Synthetic spectrum for a feed: a noise floor plus a narrow lobe for every channel keyed at that moment."""

import math
import random

from .live_state import SimInputs
from .timefmt import DAY

BINS = 1024
LOBE_HALF_WIDTH_BINS = 8


def signals_at(inputs: SimInputs, feed_id: str, t: float) -> list[tuple[float, float]]:
    """(freq_mhz, rssi_dbfs) of every key-up on the air at `t` that this feed receives."""
    if not inputs.health.receiving(feed_id, t):
        return []
    out = []
    for tx in inputs.data.day.active_at(t):
        freq = inputs.world.freqs.get(tx.channel)
        rec = next((r for r in tx.receptions if r["feed_id"] == feed_id), None)
        if freq and rec:
            out.append((freq.freq_mhz, rec["rssi_dbfs"]))
    return out


def spectrum_row(
    noise_floor: float,
    center_mhz: float,
    span_mhz: float,
    signals: list[tuple[float, float]],
    rng: random.Random,
) -> bytes:
    """One row of `BINS` int8 dBFS values."""
    floor = [noise_floor + 1.5 * math.sin(i / 37.0) + rng.gauss(0, 1.1) for i in range(BINS)]
    low = center_mhz - span_mhz / 2
    for freq_mhz, dbfs in signals:
        centre_bin = (freq_mhz - low) / span_mhz * BINS
        for i in range(
            max(0, int(centre_bin) - LOBE_HALF_WIDTH_BINS), min(BINS, int(centre_bin) + LOBE_HALF_WIDTH_BINS)
        ):
            level = dbfs - 3.0 * ((i - centre_bin) / 2.5) ** 2 + rng.gauss(0, 0.8)
            floor[i] = max(floor[i], level)
    return bytes(max(-127, min(0, round(v))) & 0xFF for v in floor)


def waterfall(inputs: SimInputs, feed_id: str, t: float, rows: int, row_s: float, seed: int = 7) -> bytes:
    """`rows` spectrum rows ending at `t`, oldest first. A feed with no samples leaves the floor at -127."""
    feed = inputs.world.feeds[feed_id]
    rng = random.Random(seed)
    out = bytearray()
    for i in range(rows):
        tau = (t - (rows - 1 - i) * row_s) % DAY
        if inputs.health.receiving(feed_id, tau):
            signals = signals_at(inputs, feed_id, tau)
            out += spectrum_row(feed.noise_floor_dbfs, feed.center_mhz, feed.sample_rate_msps, signals, rng)
        else:
            out += bytes([0x81]) * BINS  # -127
    return bytes(out)
