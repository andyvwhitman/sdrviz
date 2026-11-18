"""The recorder: a transmission's Opus packets become one Ogg Opus file and one `recording` row (D-1).

Node audio arrives as Opus packets and is written as it is. The LAN receiver's PCM is encoded with the same
encoder, so every file is Ogg Opus. A transmission is recorded only if it survived ghost suppression: the
callers start it when a browser would start hearing it. Files and rows are written on one background thread, so
the event loop never waits for the disk or the database.
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING

from ..db import open_session
from ..live.opus import FRAME_MS, FRAME_SAMPLES, OpusEncoder
from .models import Recording
from .ogg import ogg_opus

if TYPE_CHECKING:
    from ..runtime import Runtime

log = logging.getLogger(__name__)

FRAME_BYTES = FRAME_SAMPLES * 2  # s16 mono


def utc_now() -> datetime:
    return datetime.now(UTC)


@dataclass
class ActiveRecording:
    """A transmission being recorded."""

    channel_id: str
    tx_seq: int
    aar_channel: int
    feed_id: str
    started_at: datetime = field(default_factory=utc_now)
    packets: list[bytes] = field(default_factory=list)
    part: int = 1  # a transmission longer than the maximum goes on in a second file


@dataclass
class _LanTx:
    recording: ActiveRecording
    encoder: OpusEncoder = field(default_factory=OpusEncoder)
    rest: bytes = b""  # PCM that does not fill a 20 ms frame yet


class Recorder:
    def __init__(self, rt: "Runtime"):
        self.rt = rt
        self.max_packets = max(1, round(rt.settings.recording_max_s * 1000 / FRAME_MS))
        self._lan: dict[str, _LanTx] = {}
        self._pool = ThreadPoolExecutor(1, thread_name_prefix="recorder")

    # --- node audio: Opus packets ------------------------------------------------------------------------------

    def begin(self, channel_id: str, tx_seq: int, aar_channel: int, feed_id: str) -> ActiveRecording | None:
        """Start recording a transmission, unless its channel is in no bank."""
        if not self.rt.world.banks_of(channel_id):
            return None
        return ActiveRecording(channel_id, tx_seq, aar_channel, feed_id)

    def add(self, recording: ActiveRecording, packet: bytes) -> None:
        recording.packets.append(packet)
        if len(recording.packets) >= self.max_packets:
            self.finish(recording)
            recording.part += 1

    def finish(self, recording: ActiveRecording) -> None:
        """Hand what has been heard to the writer thread. The recording can go on (a new part) afterwards."""
        if not recording.packets:
            return
        job = (recording.channel_id, recording.tx_seq, recording.part, recording.aar_channel, recording.feed_id)
        packets, started_at = recording.packets, recording.started_at
        recording.packets, recording.started_at = [], utc_now()
        self._pool.submit(self._save, job, packets, started_at)

    # --- LAN receiver audio: PCM -----------------------------------------------------------------------------------

    def add_pcm(self, channel_id: str, tx_seq: int, aar_channel: int, feed_id: str, pcm: bytes, first: bool) -> None:
        """8 kHz s16le from the LAN receiver; `first` starts a transmission."""
        if first:
            self.end_pcm(channel_id)
            if (recording := self.begin(channel_id, tx_seq, aar_channel, feed_id)) is None:
                return
            self._lan[channel_id] = _LanTx(recording)
        if (tx := self._lan.get(channel_id)) is None:
            return
        data = tx.rest + pcm
        usable = len(data) // FRAME_BYTES * FRAME_BYTES
        for start in range(0, usable, FRAME_BYTES):
            self.add(tx.recording, tx.encoder.encode(data[start : start + FRAME_BYTES]))
        tx.rest = data[usable:]

    def end_pcm(self, channel_id: str) -> None:
        """The LAN transmission ended: encode the last partial frame (padded with silence) and save."""
        if (tx := self._lan.pop(channel_id, None)) is None:
            return
        if tx.rest:
            self.add(tx.recording, tx.encoder.encode(tx.rest.ljust(FRAME_BYTES, b"\0")))
        self.finish(tx.recording)

    def end_all_pcm(self) -> None:
        for channel_id in list(self._lan):
            self.end_pcm(channel_id)

    # --- the writer thread ------------------------------------------------------------------------------------------

    def flush(self) -> None:
        """Wait until everything handed over so far is on disk and in the database."""
        self._pool.submit(lambda: None).result()

    def stop(self) -> None:
        self.end_all_pcm()
        self._pool.shutdown(wait=True)

    def _save(self, job: tuple, packets: list[bytes], started_at: datetime) -> None:
        channel_id, tx_seq, part, aar_channel, feed_id = job
        try:
            data = ogg_opus(packets)
            path = self._free_path(started_at, channel_id, tx_seq, part)
            path.parent.mkdir(parents=True, exist_ok=True)
            temp = path.with_suffix(".part")
            temp.write_bytes(data)
            temp.replace(path)
            feed = self.rt.world.feeds.get(feed_id)
            row = Recording(
                frequency_id=channel_id,
                aar_channel=aar_channel,
                feed_id=feed_id,
                feed_lat=feed.lat if feed else None,
                feed_lon=feed.lon if feed else None,
                started_at=started_at,
                duration_s=round(len(packets) * FRAME_MS / 1000, 2),
                audio_path=path.relative_to(self.rt.settings.audio_path).as_posix(),
                audio_bytes=len(data),
                transcript_state="pending" if self.rt.transcription.enabled else "empty",
                created_at=utc_now(),
            )
            with open_session(self.rt.db) as session:
                session.add(row)
                session.commit()
        except Exception:
            log.exception("could not save the recording of %s (tx %s)", channel_id, tx_seq)
            return
        self.rt.transcription.wake()

    def _free_path(self, started_at: datetime, channel_id: str, tx_seq: int, part: int) -> Path:
        folder = self.rt.settings.audio_path / f"{started_at:%Y/%m/%d}"
        name = f"{channel_id}-{tx_seq}" + (f"-{part}" if part > 1 else "")
        path, extra = folder / f"{name}.ogg", 1
        while path.exists():  # transmission numbers start over when the server restarts
            extra += 1
            path = folder / f"{name}.{extra}.ogg"
        return path
