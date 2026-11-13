"""The recorded day's transmissions, indexed for time-window queries on the repeating day."""

import bisect
from collections import defaultdict
from dataclasses import replace

from .timefmt import DAY
from .types import Tx


class SimDay:
    """Rows are expanded to three copies (-24 h, 0, +24 h) so any window wraps past midnight."""

    def __init__(self, rows: list[Tx]):
        self.rows = sorted(rows, key=lambda tx: tx.t)
        self._starts = [tx.t for tx in self.rows]
        self._expanded = sorted(
            (replace(tx, t=tx.t + shift) if shift else tx for shift in (-DAY, 0, DAY) for tx in self.rows),
            key=lambda tx: tx.t,
        )
        self._expanded_starts = [tx.t for tx in self._expanded]
        self._by_channel: dict[str, tuple[list[float], list[Tx]]] = {}
        grouped: dict[str, list[Tx]] = defaultdict(list)
        for tx in self._expanded:
            grouped[tx.channel].append(tx)
        for channel, txs in grouped.items():
            self._by_channel[channel] = ([tx.t for tx in txs], txs)

    def window(self, start: float, end: float) -> list[Tx]:
        """Rows starting in [start, end) on the repeating day; `start` may be negative."""
        lo = bisect.bisect_left(self._expanded_starts, start)
        hi = bisect.bisect_left(self._expanded_starts, end)
        return self._expanded[lo:hi]

    def channel_window(self, channel: str, start: float, end: float) -> list[Tx]:
        starts, txs = self._by_channel.get(channel, ([], []))
        return txs[bisect.bisect_left(starts, start) : bisect.bisect_left(starts, end)]

    def active_at(self, t: float) -> list[Tx]:
        """Rows on the air at `t` (started at or before it, not yet ended)."""
        longest = max((tx.duration for tx in self.rows), default=0.0)
        return [tx for tx in self.window(t - longest, t + 0.001) if tx.t <= t < tx.end]

    def starting_between(self, a: float, b: float) -> list[Tx]:
        """Rows (unshifted) with a start time in [a, b) on the repeating day; handles the midnight wrap."""
        lo, hi = a % DAY, b % DAY
        if lo <= hi:
            return self._slice(lo, hi)
        return self._slice(lo, DAY) + self._slice(0.0, hi)

    def _slice(self, lo: float, hi: float) -> list[Tx]:
        return self.rows[bisect.bisect_left(self._starts, lo) : bisect.bisect_left(self._starts, hi)]
