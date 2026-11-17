"""Narrowband FM receiver chain, numpy only.

    IQ (2.4 MS/s) → Channelizer → 48 kS/s baseband per channel → Squelch → FmDemod → 8 kHz PCM

The channelizer is a fast-convolution (overlap-save) filter bank: one FFT of each block is shared
by all channels, and each channel needs only a small inverse FFT at the 48 kS/s output rate.
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


def _fast_size(n: int) -> int:
    """Smallest FFT-friendly number (only the prime factors 2, 3, 5 and 7) that is at least n."""
    while True:
        rest = n
        for prime in (2, 3, 5, 7):
            while rest % prime == 0:
                rest //= prime
        if rest == 1:
            return n
        n += 1


@dataclass(frozen=True)
class _Plan:
    """Sizes and filter for one block length (overlap-save)."""

    history: int  # samples kept in front of the new block; at least the filter length - 1
    size: int  # FFT size: history + block length
    out_size: int  # inverse FFT size: size // decim
    skip: int  # outputs to drop from the front: they belong to the history
    bins: np.ndarray  # the out_size bins around DC, in FFT order: 0, 1, ... then ..., -2, -1
    response: np.ndarray  # filter response at those bins, with the 1/decim of the smaller inverse FFT folded in
    steps: np.ndarray  # 0, 1, 2, ... for the phase ramp


@dataclass(frozen=True)
class Block:
    """One IQ block after the shared FFT, ready for `Channelizer.extract`, once per channel (thread safe)."""

    spectrum: np.ndarray
    plan: _Plan
    start: int  # absolute sample index of the first sample of the FFT block


class Channelizer:
    """Shift, filter and decimate many channels out of one wideband IQ stream (fast convolution).

    One FFT of the block (plus the end of the previous one) is shared by all channels. For each channel
    the bins around its frequency are multiplied by the low-pass response and brought back by an inverse
    FFT 1/decim as long, which is the filtered, shifted and decimated signal. The part of the shift that
    does not land on a bin (at most half a bin, under 10 Hz) is removed by a rotation afterwards.
    Outputs match the direct filter except that signals further than 24 kHz from a channel are dropped
    instead of folded into it.
    """

    def __init__(self, sample_rate: int, center_hz: int, num_taps: int = 191, cutoff_hz: float = 6_000):
        if sample_rate % IF_RATE:
            raise ValueError(f"sample rate {sample_rate} must be a multiple of {IF_RATE}")
        self.rate = sample_rate
        self.center_hz = center_hz
        self.decim = sample_rate // IF_RATE
        self.taps = lowpass(num_taps, cutoff_hz, sample_rate)
        self._history = np.zeros(num_taps - 1, dtype=np.complex64)
        self._consumed = 0  # samples processed so far
        self._plans: dict[int, _Plan] = {}
        self._bin_index: dict[tuple[int, int], np.ndarray] = {}

    def in_band(self, freq_hz: int) -> bool:
        return abs(freq_hz - self.center_hz) < 0.45 * self.rate

    def _plan(self, block_len: int) -> _Plan:
        if block_len not in self._plans:
            if block_len % self.decim:
                raise ValueError(f"block length {block_len} must be a multiple of {self.decim}")
            need = len(self.taps) - 1
            history = -(-need // self.decim) * self.decim  # a whole number of output samples
            while (block_len + history) % self.decim or _fast_size(block_len + history) != block_len + history:
                history += self.decim
            size = block_len + history
            out_size = size // self.decim
            bins = np.fft.fftfreq(out_size, 1 / out_size).round().astype(np.int64)
            response = np.fft.fft(self.taps, size)[bins % size] / self.decim
            self._plans[block_len] = _Plan(
                history, size, out_size, history // self.decim, bins, response.astype(np.complex64), np.arange(out_size)
            )
        return self._plans[block_len]

    def begin(self, iq: np.ndarray) -> Block:
        """Take the next block (length a multiple of decim): updates the stream state, does the shared FFT."""
        plan = self._plan(len(iq))
        padding = np.zeros(plan.history - len(self._history), dtype=np.complex64)
        extended = np.concatenate([padding, self._history, iq])
        self._history = extended[-len(self._history) :]
        start = self._consumed - plan.history
        self._consumed += len(iq)
        return Block(np.fft.fft(extended), plan, start)

    def extract(self, block: Block, freq_hz: int) -> np.ndarray:
        """One channel of a block at IF_RATE, length len(iq)//decim. Safe to call from several threads."""
        plan, offset = block.plan, round(freq_hz - self.center_hz)
        shift = round(offset * plan.size / self.rate)  # whole bins
        if (plan.size, shift) not in self._bin_index:
            self._bin_index[plan.size, shift] = (shift + plan.bins) % plan.size
        narrow = block.spectrum[self._bin_index[plan.size, shift]] * plan.response
        out = np.fft.ifft(narrow)[plan.skip :]

        # What the bins did not shift (the mix with e^{-j2π offset n / rate} for absolute sample n), applied
        # at the filter's centre sample, so it is the same phase as mixing before the filter.
        residual_hz = offset - shift * self.rate / plan.size
        centre = plan.history + plan.steps[: len(out)] * self.decim - (len(self.taps) - 1) / 2
        cycles = (offset * block.start % self.rate + residual_hz * centre) / self.rate
        return (out * np.exp(-2j * np.pi * cycles)).astype(np.complex64)

    def process(self, iq: np.ndarray, freqs_hz: list[int], pool=None) -> np.ndarray:
        """One block of IQ (length a multiple of decim) → array (len(iq)//decim, len(freqs_hz)) at IF_RATE.

        `pool` is an optional executor (anything with `map`) to spread the channels over cores."""
        block = self.begin(iq)
        if not freqs_hz:
            return np.empty((len(iq) // self.decim, 0), dtype=np.complex64)
        columns = (pool.map if pool else map)(lambda freq: self.extract(block, freq), freqs_hz)
        return np.stack(list(columns), axis=1)


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


@dataclass
class Reception:
    """What one channel did with one block."""

    power_db: float
    was_open: bool
    is_open: bool
    pcm: bytes | None  # None while the squelch is shut


def receive(squelch: Squelch, demod: FmDemod, baseband: np.ndarray) -> Reception:
    """Power, demod, squelch and carrier gate for one channel's block. Each channel has its own state,
    so channels can run in different threads."""
    power = channel_power(baseband)
    pcm = demod.process(baseband)  # always demodulate, so the filter state stays continuous
    was_open = squelch.is_open
    is_open = squelch.update(power, demod.hiss)
    power_db = float(10 * np.log10(power + 1e-12))
    if not (was_open or is_open):
        return Reception(power_db, was_open, is_open, None)
    # silence the noise burst where the carrier drops, without waiting for the squelch to close
    pcm = carrier_gate(pcm, baseband, squelch.floor * 10 ** (squelch.close_db / 10))
    return Reception(power_db, was_open, is_open, pcm)
