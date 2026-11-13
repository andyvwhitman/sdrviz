"""Wire formats of /ws/live: JSON text messages and fixed-header binary frames (big-endian)."""

import json
import struct
from typing import Any

PROTOCOL_VERSION = 1
KIND_AUDIO = 1
KIND_SPECTRUM = 2
CODEC_PCM = 0  # s16le, mono, 8000 Hz
CODEC_OPUS = 1  # reserved for the real backend
FLAG_FIRST = 0b01
FLAG_LAST = 0b10

PCM_RATE = 8000
CHUNK_MS = 100
CHUNK_BYTES = PCM_RATE * CHUNK_MS // 1000 * 2

_AUDIO = struct.Struct(">BBBBII")
_SPECTRUM = struct.Struct(">BBHffI")


def message(type_: str, **payload: Any) -> str:
    return json.dumps({"type": type_, **payload}, separators=(",", ":"), ensure_ascii=False)


def audio_frame(aar_channel: int, tx_seq: int, offset_ms: int, flags: int, pcm: bytes) -> bytes:
    return _AUDIO.pack(KIND_AUDIO, CODEC_PCM, aar_channel, flags, tx_seq, offset_ms) + pcm


def spectrum_frame(center_mhz: float, span_mhz: float, t_ms: int, bins: bytes) -> bytes:
    header = _SPECTRUM.pack(KIND_SPECTRUM, 0, len(bins), center_mhz, span_mhz, t_ms & 0xFFFFFFFF)
    return header + bins
