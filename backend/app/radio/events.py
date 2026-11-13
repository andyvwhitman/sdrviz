"""The live receiver's squelch, told to the UI in the same /ws/live messages the replay sends.

A squelch opening is a transmission: `keyup` (a transcript row, the hero strip, a keyed tile),
`level` while it lasts, `keydown` when it closes, and a `channel` patch whenever a tile's state changes.
There is no decoder yet, so rows carry no transcript, speaker or train.
"""

import time
from dataclasses import dataclass
from typing import TYPE_CHECKING

from ..live import protocol
from ..sim.live_state import CHANNEL_RANGES
from ..sim.timefmt import aar4, age_label, hms
from ..sim.types import ROLE_TAGS
from ..sim.world import LIVE_FEED_ID, World

if TYPE_CHECKING:
    from ..runtime import Runtime


@dataclass
class LiveTx:
    id: str
    seq: int
    channel_id: str
    t: float  # sim clock at key-up
    started: float  # monotonic, for the timer
    snr_db: float
    rssi_dbfs: float

    def elapsed(self) -> float:
        return time.monotonic() - self.started


class LiveEvents:
    def __init__(self, rt: "Runtime"):
        self.rt = rt
        self.hub = rt.hub
        self.on_air: dict[str, LiveTx] = {}
        self.last_end: dict[str, float] = {}  # sim clock of each channel's last key-down

    @property
    def world(self) -> World:
        return self.rt.world

    def _now(self) -> float:
        return self.rt.clock.now()

    def _bank_ids(self) -> list[str]:
        return self.rt.active_bank.frequency_ids

    # --- transitions -----------------------------------------------------------

    def key_up(self, channel_id: str, seq: int, snr_db: float, rssi_dbfs: float) -> None:
        t = self._now()
        tx = LiveTx(f"live-{seq}", seq, channel_id, t, time.monotonic(), snr_db, rssi_dbfs)
        self.on_air[channel_id] = tx
        freq = self.world.freqs[channel_id]
        row = self._row(tx, live=True)
        self.hub.broadcast(
            protocol.message(
                "keyup",
                tx_id=tx.id,
                tx_seq=seq,
                channel_id=channel_id,
                aar=f"CH{freq.aar_channel:02d}",
                feed_id=LIVE_FEED_ID,
                receptions=row["receptions"],
                role="unknown",
                role_tag=ROLE_TAGS.get("unknown", "UNK"),
                speaker=None,
                train_id=None,
                place_id=None,
                off_bank=row["off_bank"],
                t=t,
                clock_tenths=hms(t, tenths=True),
                row=row,
            )
        )
        self._send_channel(channel_id)

    def key_down(self, channel_id: str) -> None:
        tx = self.on_air.pop(channel_id, None)
        if not tx:
            return
        duration = round(tx.elapsed(), 1)
        self.last_end[channel_id] = tx.t + duration
        self.hub.broadcast(
            protocol.message("keydown", tx_id=tx.id, channel_id=channel_id, duration_s=duration, t=tx.t + duration)
        )
        self._send_channel(channel_id)

    def levels(self, readings: dict[str, tuple[float, float]]) -> None:
        """readings: channel id → (power dBFS, SNR dB), for the channels on air."""
        levels = {cid: {"db": round(db, 1), "peak": round(db, 1)} for cid, (db, _) in readings.items()}
        for cid, (db, snr) in readings.items():
            if tx := self.on_air.get(cid):
                tx.snr_db, tx.rssi_dbfs = max(tx.snr_db, snr), max(tx.rssi_dbfs, db)
        if levels:
            self.hub.broadcast(protocol.message("level", t=self._now(), levels=levels))

    def each_second(self) -> None:
        """Clock tick, plus the timers and LAST readouts of channels that moved recently."""
        t = self._now()
        self.hub.broadcast(protocol.message("tick", t=t, clock=hms(t), clock_tenths=hms(t, tenths=True), speed=1.0))
        recent = [cid for cid, end in self.last_end.items() if t - end < CHANNEL_RANGES["recent-dim"] + 1]
        for cid in {*self.on_air, *recent}:
            self._send_channel(cid)

    # --- views -----------------------------------------------------------------

    def _receptions(self, tx: LiveTx) -> list[dict]:
        return [{"feed_id": LIVE_FEED_ID, "snr_db": round(tx.snr_db, 1), "rssi_dbfs": round(tx.rssi_dbfs, 1)}]

    def _row(self, tx: LiveTx, live: bool) -> dict:
        freq = self.world.freqs[tx.channel_id]
        return {
            "id": tx.id,
            "t_offset_s": round(tx.t, 1),
            "clock": hms(tx.t),
            "clock_tenths": hms(tx.t, tenths=True),
            "aar": f"CH{freq.aar_channel:02d}",
            "aar4": aar4(freq.aar_channel),
            "frequency_id": tx.channel_id,
            "label": freq.label,
            "off_bank": tx.channel_id not in self._bank_ids(),
            "feed_id": LIVE_FEED_ID,
            "feed_label": self.world.feed_short(LIVE_FEED_ID),
            "role": "unknown",
            "role_tag": ROLE_TAGS.get("unknown", "UNK"),
            "speaker": None,
            "train_id": None,
            "place_id": None,
            "duration_s": 0.0,
            "state": "not_recorded",  # no recorder or decoder yet
            "final_state": "not_recorded",
            "live": live,
            "transcript": "",
            "words": [],
            "confidence": None,
            "detector": None,
            "sim": False,
            "elapsed_s": 0.0,
            "receptions": self._receptions(tx),
        }

    def _send_channel(self, channel_id: str) -> None:
        t = self._now()
        tx = self.on_air.get(channel_id)
        patch: dict = {"id": channel_id, "channel_fault": None}
        if tx:
            elapsed = tx.elapsed()
            patch |= {
                "state": "tx",
                "status_readout": None,
                "tx": {
                    "tx_id": tx.id,
                    "elapsed_s": round(elapsed, 1),
                    "timer": f"{int(elapsed // 60):02d}:{elapsed % 60:04.1f}",
                    "primary_feed": LIVE_FEED_ID,
                    "via": self.world.feed_short(LIVE_FEED_ID),
                    "receptions": self._receptions(tx),
                    "train_id": None,
                },
            }
        else:
            since = t - self.last_end.get(channel_id, float("-inf"))
            if since < CHANNEL_RANGES["recent"]:
                state = "recent"
            elif since < CHANNEL_RANGES["recent-dim"]:
                state = "recent-dim"
            else:
                state = "idle"
            readout = None if state == "idle" else "LAST " + age_label(since)
            patch |= {"state": state, "status_readout": readout, "tx": None}
        self.hub.broadcast(protocol.message("channel", **patch))
