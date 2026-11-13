"""Feed health: the scripted state timeline plus acknowledgements, evaluated at a clock time."""

from collections import defaultdict

from .timefmt import DAY, hms


class Health:
    """Per-feed state from `events` ((t, state, label) sorted by t) and `acks` ((feed_id, t, label))."""

    def __init__(self, events: dict[str, list[tuple[float, str, str]]], acks: list[tuple[str, float, str]]):
        self.events = events
        self.acks = acks
        # Spans with no samples (stale NO SAMPLES starts 30 s after the last sample).
        self.outages: dict[str, list[tuple[float, float]]] = defaultdict(list)
        for fid, evs in events.items():
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
        acked = [
            a
            for a in self.acks
            if a[0] == fid
            and a[2] == current["label"]
            and current["since"] is not None
            and current["since"] <= a[1] <= t
        ]
        current["acked"] = bool(acked) and current["state"] == "fault"
        current["acked_at"] = acked[-1][1] if current["acked"] else None
        return current

    def link_down(self, fid: str, t: float) -> bool:
        """True while the feed's link is down (offline / reconnecting, or a LINK LOST fault)."""
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
            for (t, state, label), nxt in zip(evs, [*evs[1:], (DAY, "ok", "")], strict=True):
                a, b = t + shift, nxt[0] + shift
                if state != "ok" and b > start and a < end:
                    out.append(
                        {
                            "start_t": round(a, 1),
                            "end_t": round(b, 1),
                            "start": hms(a),
                            "end": hms(b),
                            "state": state,
                            "label": label,
                            "active": a <= end < b,
                        }
                    )
        return out
