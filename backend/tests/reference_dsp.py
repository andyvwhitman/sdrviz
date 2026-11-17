"""The original matmul channelizer, kept as the reference the FFT channelizer is tested against."""

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from app.radio.dsp import IF_RATE, lowpass


class MatmulChannelizer:
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
