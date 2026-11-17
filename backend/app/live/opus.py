"""Opus for the node uplink: 8 kHz mono s16, one 20 ms packet (160 samples) per frame. Uses PyAV's libopus."""

import av
import numpy as np

RATE = 8_000
FRAME_SAMPLES = RATE * 20 // 1000  # 20 ms
FRAME_MS = 20
BIT_RATE = 12_000


class OpusEncoder:
    """Encode s16le PCM in 20 ms steps; one call per 20 ms of audio gives one packet."""

    def __init__(self, bit_rate: int = BIT_RATE):
        self._codec = av.CodecContext.create("libopus", "w")
        self._codec.sample_rate = RATE
        self._codec.layout = "mono"
        self._codec.format = "s16"
        self._codec.bit_rate = bit_rate
        self._codec.open()
        self._pts = 0

    def encode(self, pcm: bytes) -> bytes:
        samples = np.frombuffer(pcm, dtype="<i2")
        if len(samples) != FRAME_SAMPLES:
            raise ValueError(f"expected {FRAME_SAMPLES} samples (20 ms), got {len(samples)}")
        frame = av.AudioFrame.from_ndarray(samples.reshape(1, -1), format="s16", layout="mono")
        frame.sample_rate, frame.pts = RATE, self._pts
        self._pts += FRAME_SAMPLES
        return b"".join(bytes(packet) for packet in self._codec.encode(frame))


class OpusDecoder:
    """Decode packets to 8 kHz s16le PCM. libopus decodes at 48 kHz, so the output is resampled back
    (the first packet after a reset comes out 16 samples, 2 ms, short: the resampler's delay)."""

    def __init__(self) -> None:
        self._codec = av.CodecContext.create("libopus", "r")
        self._codec.sample_rate = RATE
        self._codec.layout = "mono"
        self._codec.open()
        self._resampler = av.AudioResampler(format="s16", layout="mono", rate=RATE)

    def decode(self, packet: bytes) -> bytes:
        out = bytearray()
        for frame in self._codec.decode(av.Packet(packet)):
            for resampled in self._resampler.resample(frame):
                out += resampled.to_ndarray().astype("<i2").tobytes()
        return bytes(out)

    def reset(self) -> None:
        """Start a new transmission: forget filter state of the last one (called on FLAG_FIRST)."""
        self.__init__()
