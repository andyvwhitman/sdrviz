"""Wire formats of /ws/live: JSON text messages and fixed-header binary frames (big-endian)."""

import json
import struct
from typing import Any

PROTOCOL_VERSION = 1
KIND_AUDIO = 1
KIND_SPECTRUM = 2
CODEC_PCM = 0  # s16le, mono, 8000 Hz
CODEC_OPUS = 1  # 8 kHz mono, one 20 ms packet per frame; only on the node uplink (docs/node-protocol.md)
FLAG_FIRST = 0b01
FLAG_LAST = 0b10

PCM_RATE = 8000
CHUNK_MS = 100
CHUNK_BYTES = PCM_RATE * CHUNK_MS // 1000 * 2

AUDIO_HEADER = struct.Struct(">BBBBII")
SPECTRUM_HEADER = struct.Struct(">BBHffI")


def message(type_: str, **payload: Any) -> str:
    return json.dumps({"type": type_, **payload}, separators=(",", ":"), ensure_ascii=False)


def audio_frame(
    aar_channel: int, tx_seq: int, offset_ms: int, flags: int, payload: bytes, codec: int = CODEC_PCM
) -> bytes:
    """`payload` is s16le PCM (CODEC_PCM) or one Opus packet (CODEC_OPUS, node uplink only)."""
    return AUDIO_HEADER.pack(KIND_AUDIO, codec, aar_channel, flags, tx_seq, offset_ms) + payload


def spectrum_frame(center_mhz: float, span_mhz: float, t_ms: int, bins: bytes) -> bytes:
    header = SPECTRUM_HEADER.pack(KIND_SPECTRUM, 0, len(bins), center_mhz, span_mhz, t_ms & 0xFFFFFFFF)
    return header + bins
