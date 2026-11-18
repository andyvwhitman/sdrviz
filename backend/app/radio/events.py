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
from ..sim.timefmt import DAY, aar4, age_label, hms
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
    feed_id: str = LIVE_FEED_ID  # the receiver that owns this transmission

    def elapsed(self) -> float:
        return time.monotonic() - self.started


class LiveEvents:
    def __init__(self, rt: "Runtime"):
        self.rt = rt
        self.hub = rt.hub
        self.on_air: dict[str, LiveTx] = {}
        self.last_end: dict[str, float] = {}  # sim clock of each channel's last key-down (may pass DAY at midnight)
        self.last_tx: dict[str, LiveTx] = {}  # each channel's last finished transmission

    @property
    def world(self) -> World:
        return self.rt.world

    def _now(self) -> float:
        return self.rt.clock.now()

    def _bank_ids(self) -> list[str]:
        return self.rt.active_bank.frequency_ids

    # --- transitions -----------------------------------------------------------

    def owns(self, channel_id: str, feed_id: str) -> bool:
        """Whether `feed_id`'s transmission is the one on air on this channel."""
        tx = self.on_air.get(channel_id)
        return tx is not None and tx.feed_id == feed_id

    def key_up(self, channel_id: str, seq: int, snr_db: float, rssi_dbfs: float, feed_id: str = LIVE_FEED_ID) -> bool:
        """Start a transmission. First key-up wins (decision 49): False when another receiver already has
        this channel on air; the caller then ignores that transmission until its key-down."""
        if channel_id in self.on_air:
            return False
        t = self._now()
        tx = LiveTx(f"live-{seq}", seq, channel_id, t, time.monotonic(), snr_db, rssi_dbfs, feed_id)
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
                feed_id=feed_id,
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
        return True

    def key_down(self, channel_id: str, feed_id: str = LIVE_FEED_ID) -> None:
        """End the transmission, if `feed_id` owns it."""
        if not self.owns(channel_id, feed_id):
            return
        tx = self.on_air.pop(channel_id)
        duration = round(tx.elapsed(), 1)
        self.last_end[channel_id] = tx.t + duration
        self.last_tx[channel_id] = tx
        self.hub.broadcast(
            protocol.message("keydown", tx_id=tx.id, channel_id=channel_id, duration_s=duration, t=tx.t + duration)
        )
        self._send_channel(channel_id)

    def levels(self, readings: dict[str, tuple[float, float]], feed_id: str = LIVE_FEED_ID) -> None:
        """readings: channel id → (power dBFS, SNR dB), for the channels `feed_id` has on air."""
        readings = {cid: reading for cid, reading in readings.items() if self.owns(cid, feed_id)}
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
        recent = [cid for cid in self.last_end if self._since_end(cid, t) < CHANNEL_RANGES["recent-dim"] + 1]
        for cid in {*self.on_air, *recent}:
            self._send_channel(cid)

    # --- views -----------------------------------------------------------------

    def _receptions(self, tx: LiveTx) -> list[dict]:
        return [{"feed_id": tx.feed_id, "snr_db": round(tx.snr_db, 1), "rssi_dbfs": round(tx.rssi_dbfs, 1)}]

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
            "feed_id": tx.feed_id,
            "feed_label": self.world.feed_short(tx.feed_id),
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

    def _since_end(self, channel_id: str, t: float) -> float:
        """Seconds since the channel's last key-down (inf if none); wraps with the clock at midnight."""
        end = self.last_end.get(channel_id)
        return float("inf") if end is None else (t - end) % DAY

    def channel_patch(self, channel_id: str) -> dict:
        """The live part of a channel: its state, the transmission on air and when it was last heard."""
        t = self._now()
        tx = self.on_air.get(channel_id)
        patch: dict = {"id": channel_id, "channel_fault": None}
        if last := self.last_tx.get(channel_id):
            since = self._since_end(channel_id, t)
            patch["last_heard"] = {
                "tx_id": last.id,
                "end_t": round(self.last_end[channel_id] % DAY, 1),
                "clock": hms(last.t),
                "age_s": round(since, 1),
                "age_label": age_label(since),
                "via": self.world.feed_short(last.feed_id),
            }
        if tx:
            elapsed = tx.elapsed()
            patch |= {
                "state": "tx",
                "status_readout": None,
                "tx": {
                    "tx_id": tx.id,
                    "elapsed_s": round(elapsed, 1),
                    "timer": f"{int(elapsed // 60):02d}:{elapsed % 60:04.1f}",
                    "primary_feed": tx.feed_id,
                    "via": self.world.feed_short(tx.feed_id),
                    "receptions": self._receptions(tx),
                    "train_id": None,
                },
            }
        else:
            since = self._since_end(channel_id, t)
            if since < CHANNEL_RANGES["recent"]:
                state = "recent"
            elif since < CHANNEL_RANGES["recent-dim"]:
                state = "recent-dim"
            else:
                state = "idle"
            readout = None if state == "idle" else "LAST " + age_label(since)
            patch |= {"state": state, "status_readout": readout, "tx": None}
        return patch

    def _send_channel(self, channel_id: str) -> None:
        self.hub.broadcast(protocol.message("channel", **self.channel_patch(channel_id)))

    def overlay(self, channels: list[dict]) -> list[dict]:
        """Snapshot channels with what the live receivers heard laid over them (key-ups, last heard)."""
        known = {*self.on_air, *self.last_end}
        out = []
        for channel in channels:
            if channel["id"] in known:
                patch = self.channel_patch(channel["id"])
                patch.pop("channel_fault")
                channel = channel | patch
            out.append(channel)
        return out

    def active_rows(self) -> list[dict]:
        """The transmissions on air now, as the snapshot's active_transmissions."""
        return [
            self._row(tx, live=True) | {"elapsed_s": round(tx.elapsed(), 1), "receptions": self._receptions(tx)}
            for tx in self.on_air.values()
        ]
