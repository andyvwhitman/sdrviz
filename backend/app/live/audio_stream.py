"""Live audio: a rendered clip cut into 100 ms PCM frames, paced by the key-up's elapsed time."""

import math
from dataclasses import dataclass

from ..audio.cache import AudioStore
from .hub import Hub
from .protocol import CHUNK_BYTES, CHUNK_MS, FLAG_FIRST, FLAG_LAST, audio_frame


@dataclass
class AudioStream:
    tx_id: str
    channel_id: str
    aar_channel: int
    seq: int
    sent: int = 0  # chunks already handled (sent or deliberately skipped)
    done: bool = False


def advance(stream: AudioStream, elapsed_s: float, store: AudioStore, hub: Hub) -> None:
    """Send every chunk that has fully elapsed. A clip that is not rendered yet is skipped, not waited for."""
    pcm = store.pcm(stream.tx_id)
    elapsed_chunks = int(elapsed_s * 1000 // CHUNK_MS)
    if pcm is None:
        stream.sent = elapsed_chunks
        return
    total = math.ceil(len(pcm) / CHUNK_BYTES)
    listening = hub.audio_subscribed(stream.channel_id)
    while stream.sent < min(elapsed_chunks, total):
        k = stream.sent
        if listening:
            flags = (FLAG_FIRST if k == 0 else 0) | (FLAG_LAST if k == total - 1 else 0)
            chunk = pcm[k * CHUNK_BYTES : (k + 1) * CHUNK_BYTES]
            hub.send_audio(stream.channel_id, audio_frame(stream.aar_channel, stream.seq, k * CHUNK_MS, flags, chunk))
        stream.sent += 1
    stream.done = stream.sent >= total
