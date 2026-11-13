"""The on-disk clip cache (data/audio/) and the per-clip render lock."""

import array
import logging
import threading
from collections import defaultdict
from pathlib import Path

from ..sim.types import Tx
from . import synth
from .synth import ClipJob

log = logging.getLogger(__name__)


def job_for(tx: Tx) -> ClipJob:
    return ClipJob(id=tx.id, text=tx.text, duration_s=tx.duration, role=tx.role, speaker=tx.speaker)


class AudioStore:
    """`<id>.webm` (Opus, History) and `<id>.pcm` (8 kHz s16le, live), rendered lazily."""

    def __init__(self, directory: Path):
        self.directory = directory
        self._locks: defaultdict[str, threading.Lock] = defaultdict(threading.Lock)
        self._guard = threading.Lock()
        self._pcm_cache: dict[str, bytes] = {}

    def webm_path(self, clip_id: str) -> Path:
        return self.directory / f"{clip_id}.webm"

    def pcm_path(self, clip_id: str) -> Path:
        return self.directory / f"{clip_id}.pcm"

    def is_ready(self, clip_id: str) -> bool:
        return self.pcm_path(clip_id).exists()  # rendered last, so it marks a finished clip

    def ensure(self, job: ClipJob) -> Path:
        """Render the clip if it is not cached yet (one render per id at a time). Returns the Opus path."""
        with self._guard:
            lock = self._locks[job.id]
        with lock:
            if not self.is_ready(job.id):
                log.info("rendering clip %s", job.id)
                synth.render_clip(job, self.webm_path(job.id), self.pcm_path(job.id))
        return self.webm_path(job.id)

    def pcm(self, clip_id: str) -> bytes | None:
        """The 8 kHz PCM of a rendered clip, or None if it is not rendered yet."""
        if clip_id in self._pcm_cache:
            return self._pcm_cache[clip_id]
        if not self.is_ready(clip_id):
            return None
        data = self.pcm_path(clip_id).read_bytes()
        if len(self._pcm_cache) > 32:
            self._pcm_cache.pop(next(iter(self._pcm_cache)))
        self._pcm_cache[clip_id] = data
        return data

    def peaks(self, clip_id: str, bins: int) -> list[float] | None:
        """Waveform peaks normalised to 0..1, one per bin."""
        pcm = self.pcm(clip_id)
        if pcm is None:
            return None
        samples = array.array("h")
        samples.frombytes(pcm[: len(pcm) // 2 * 2])
        size = max(1, len(samples) // bins)
        peaks = [max(map(abs, samples[i * size : (i + 1) * size]), default=0) / 32768 for i in range(bins)]
        top = max(peaks, default=0) or 1.0
        return [round(p / top, 3) for p in peaks]
