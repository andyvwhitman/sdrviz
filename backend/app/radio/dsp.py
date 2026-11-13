"""Narrowband FM receiver chain, numpy only.

    IQ (2.4 MS/s) → Channelizer → 48 kS/s baseband per channel → Squelch → FmDemod → 8 kHz PCM

The channelizer folds each channel's frequency shift into its filter taps and only computes the
decimated output samples, so every channel comes out of one matrix multiply per block.
"""

from dataclasses import dataclass, field

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

IF_RATE = 48_000  # per-channel baseband rate after the channelizer
AUDIO_RATE = 8_000  # matches the /ws/live PCM codec
NFM_DEVIATION_HZ = 2_500  # narrowband FM peak deviation (land mobile)


def lowpass(num_taps: int, cutoff_hz: float, rate_hz: float) -> np.ndarray:
    """Windowed-sinc low-pass FIR with unity gain at DC."""
    n = np.arange(num_taps) - (num_taps - 1) / 2
    taps = np.sinc(2 * cutoff_hz / rate_hz * n) * np.hamming(num_taps)
    return (taps / taps.sum()).astype(np.float32)


def iq_from_u8(raw: bytes) -> np.ndarray:
    """rtl_tcp's interleaved unsigned 8-bit I/Q → complex64 in [-1, 1]."""
    samples = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 127.5) / 127.5
    return (samples[0::2] + 1j * samples[1::2]).astype(np.complex64)


class Channelizer:
    """Shift, filter and decimate many channels out of one wideband IQ stream."""

    def __init__(self, sample_rate: int, center_hz: int, num_taps: int = 191, cutoff_hz: float = 6_000):
        if sample_rate % IF_RATE:
            raise ValueError(f"sample rate {sample_rate} must be a multiple of {IF_RATE}")
        self.rate = sample_rate
        self.center_hz = center_hz
        self.decim = sample_rate // IF_RATE
        self.taps = lowpass(num_taps, cutoff_hz, sample_rate)
        self._tail = np.zeros(num_taps - 1, dtype=np.complex64)
        self._base = -(num_taps - 1)  # absolute index of the first sample in the extended block, mod rate
        self._bank: dict[int, np.ndarray] = {}  # offset Hz → shifted taps

    def in_band(self, freq_hz: int) -> bool:
        return abs(freq_hz - self.center_hz) < 0.45 * self.rate

    def _shifted_taps(self, offset_hz: int) -> np.ndarray:
        if offset_hz not in self._bank:
            j = np.arange(len(self.taps))
            self._bank[offset_hz] = (self.taps * np.exp(-2j * np.pi * offset_hz * j / self.rate)).astype(np.complex64)
        return self._bank[offset_hz]

    def process(self, iq: np.ndarray, freqs_hz: list[int]) -> np.ndarray:
        """One block of IQ (length a multiple of decim) → array (len(iq)//decim, len(freqs_hz)) at IF_RATE."""
        extended = np.concatenate([self._tail, iq])
        self._tail = extended[-(len(self.taps) - 1) :]
        base = self._base % self.rate
        self._base += len(iq)
        if not freqs_hz:
            return np.empty((len(iq) // self.decim, 0), dtype=np.complex64)

        windows = sliding_window_view(extended, len(self.taps))[:: self.decim]
        offsets = [round(f - self.center_hz) for f in freqs_hz]
        bank = np.stack([self._shifted_taps(off) for off in offsets], axis=1)
        out = windows @ bank

        # Remaining part of the frequency shift: e^{-j2π f n / rate} at each output sample's start index.
        starts = base + np.arange(out.shape[0], dtype=np.int64) * self.decim
        cycles = (np.outer(starts, np.array(offsets, dtype=np.int64)) % self.rate) / self.rate
        return (out * np.exp(-2j * np.pi * cycles)).astype(np.complex64)


@dataclass
class Squelch:
    """Power plus noise squelch.

    Opens when channel power rises `open_db` above a slowly rising noise-floor estimate AND the FM
    discriminator has quieted (`FmDemod.hiss` below `open_hiss`). A real carrier quiets the hiss; the
    skirt of a strong signal on a nearby channel (adjacent-channel interference) only raises the noise,
    so it lifts the power but never the quieting, and stays squelched.
    """

    open_db: float = 8.0
    close_db: float = 5.0
    hang_blocks: int = 3  # stay open this many quiet blocks (300 ms) so pauses between words don't chop
    rise_db_per_block: float = 0.05  # the floor creeps up 0.5 dB/s, so a constant carrier is eventually muted
    warmup_blocks: int = 5  # the first 500 ms (filters filling, tuner settling) only measure the floor
    open_hiss: float = 0.45  # ~1.0 is pure noise; a readable signal (10 dB or better) is under 0.2
    close_hiss: float = 0.6
    floor: float | None = None
    is_open: bool = False
    snr_db: float = 0.0  # last block, for the status endpoint
    _quiet: int = 0

    def update(self, power: float, hiss: float | None = None) -> bool:
        """hiss None skips the noise test (power squelch only)."""
        power = max(power, 1e-12)
        if self.warmup_blocks > 0:
            self.warmup_blocks -= 1
            self.floor = power
            return False
        self.floor = min(self.floor * 10 ** (self.rise_db_per_block / 10), power)
        self.snr_db = float(10 * np.log10(power / self.floor))
        if not self.is_open and self.snr_db >= self.open_db and (hiss is None or hiss <= self.open_hiss):
            self.is_open, self._quiet = True, 0
        elif self.is_open:
            holding = self.snr_db >= self.close_db and (hiss is None or hiss <= self.close_hiss)
            self._quiet = 0 if holding else self._quiet + 1
            if self._quiet > self.hang_blocks:
                self.is_open = False
        return self.is_open


def highpass(num_taps: int, cutoff_hz: float, rate_hz: float) -> np.ndarray:
    """Spectral inversion of the low-pass: passes everything above cutoff_hz. num_taps must be odd."""
    taps = -lowpass(num_taps, cutoff_hz, rate_hz)
    taps[num_taps // 2] += 1
    return taps


@dataclass
class FmDemod:
    """Quadrature FM discriminator → 3.2 kHz low-pass → 8 kHz → 300 Hz high-pass → int16 PCM.

    The high-pass removes DC (a slightly mistuned carrier) and the CTCSS tone (67-254 Hz) that
    railroad radios send under the voice, which otherwise comes through as a buzz.
    """

    audio_taps: np.ndarray = field(default_factory=lambda: lowpass(63, 3_200, IF_RATE))
    voice_taps: np.ndarray = field(default_factory=lambda: highpass(129, 270, AUDIO_RATE))
    _prev: np.complex64 = np.complex64(1)
    _tail: np.ndarray = field(default_factory=lambda: np.zeros(62, dtype=np.float32))
    _voice_tail: np.ndarray = field(default_factory=lambda: np.zeros(128, dtype=np.float32))
    hiss: float = 1.0  # last block's discriminator noise (RMS change in phase step): ~1 noise, <0.2 a clear signal

    def process(self, baseband: np.ndarray) -> bytes:
        shifted = np.concatenate([[self._prev], baseband[:-1]])
        self._prev = baseband[-1]
        phase = np.angle(baseband * np.conj(shifted)).astype(np.float32)
        self.hiss = float(np.sqrt(np.mean(np.diff(phase) ** 2)))
        audio = phase * (IF_RATE / (2 * np.pi * NFM_DEVIATION_HZ))  # ±1 at full deviation

        extended = np.concatenate([self._tail, audio])
        self._tail = extended[-(len(self.audio_taps) - 1) :]
        decim = IF_RATE // AUDIO_RATE
        pcm = sliding_window_view(extended, len(self.audio_taps))[::decim] @ self.audio_taps

        extended = np.concatenate([self._voice_tail, pcm])
        self._voice_tail = extended[-(len(self.voice_taps) - 1) :]
        pcm = sliding_window_view(extended, len(self.voice_taps)) @ self.voice_taps
        pcm = np.clip(pcm * 0.7, -1, 1)
        return (pcm * 32_000).astype("<i2").tobytes()


def channel_power(baseband: np.ndarray) -> float:
    return float(np.mean(np.abs(baseband) ** 2))


def spectrum_dbfs(iq: np.ndarray, bins: int = 1024) -> np.ndarray:
    """Average power spectrum of a block, lowest frequency first, in dB relative to a full-scale tone."""
    window = np.hanning(bins).astype(np.float32)
    segments = iq[: len(iq) // bins * bins].reshape(-1, bins) * window
    power = np.mean(np.abs(np.fft.fft(segments, axis=1)) ** 2, axis=0)
    full_scale = (bins * window.mean()) ** 2
    return np.fft.fftshift(10 * np.log10(power / full_scale + 1e-12))


GATE_WINDOW = IF_RATE // 200  # 5 ms of baseband per carrier measurement
GATE_FADE = 16  # audio samples (2 ms) of fade, so the gate never clicks


def carrier_gate(pcm: bytes, baseband: np.ndarray, threshold: float) -> bytes:
    """Silence the audio wherever the carrier is below `threshold` (linear power), in 5 ms steps.

    Without a carrier an FM discriminator outputs full-scale noise: the burst at the end of every
    transmission, while the squelch holds open over pauses between words.
    """
    audio = np.frombuffer(pcm, dtype="<i2").astype(np.float32)
    windows = len(baseband) // GATE_WINDOW
    power = np.mean(np.abs(baseband[: windows * GATE_WINDOW].reshape(windows, GATE_WINDOW)) ** 2, axis=1)
    keep = np.repeat((power >= threshold).astype(np.float32), len(audio) // windows)
    keep = np.convolve(np.pad(keep, (0, len(audio) - len(keep)), mode="edge"), np.ones(GATE_FADE) / GATE_FADE, "same")
    return (audio * keep).astype("<i2").tobytes()
