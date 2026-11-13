"""Plain data types shared by the replay modules."""

from dataclasses import dataclass, field

ROLE_TAGS = {
    "crew": "CRW",
    "dispatcher": "DSP",
    "operator": "OPR",
    "detector": "DET",
    "yardmaster": "YDM",
    "MOW": "MOW",
    "unknown": "UNK",
}


@dataclass(frozen=True)
class Tx:
    """One transmission of the recorded day. `t` is seconds after midnight (shifted copies may be < 0)."""

    id: str
    t: float
    duration: float
    channel: str
    role: str
    speaker: str | None
    text: str
    place_id: str | None
    train_id: str | None
    state: str
    sim: bool
    receptions: tuple[dict, ...]
    words: tuple[dict, ...]
    confidence: float | None
    latency: float
    detector: dict | None = field(default=None, compare=False)

    @property
    def end(self) -> float:
        return self.t + self.duration

    @property
    def feed(self) -> str:
        return self.receptions[0]["feed_id"]


def aired(tx: Tx, end: float) -> float:
    """Seconds of `tx` on the air by `end`: a key-up still live at `end` counts only its elapsed time."""
    return max(0.0, min(tx.duration, end - tx.t))
