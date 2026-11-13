"""The NFM receiver chain recovers a tone FM-modulated onto one channel, and stays quiet elsewhere."""

import numpy as np

from app.radio.dsp import AUDIO_RATE, Channelizer, FmDemod, Squelch, carrier_gate, channel_power, iq_from_u8

RATE = 2_400_000
CENTER = 160_897_500
CH54 = 160_920_000  # AAR 54, Amtrak NEC
CH08 = 160_230_000  # AAR 08, nothing on it in this test
BLOCK = RATE // 10  # 100 ms


def rtl_bytes(seconds: float, tone_hz: float = 1_000, deviation_hz: float = 2_000, seed: int = 1) -> bytes:
    """What rtl_tcp would send: noise plus an FM carrier on CH54, as interleaved uint8 I/Q."""
    n = int(seconds * RATE)
    t = np.arange(n) / RATE
    phase = 2 * np.pi * (CH54 - CENTER) * t + deviation_hz / tone_hz * np.sin(2 * np.pi * tone_hz * t)
    rng = np.random.default_rng(seed)
    signal = 0.3 * np.exp(1j * phase) + 0.02 * (rng.standard_normal(n) + 1j * rng.standard_normal(n))
    interleaved = np.empty(2 * n, dtype=np.float64)
    interleaved[0::2], interleaved[1::2] = signal.real, signal.imag
    return np.clip(interleaved * 127.5 + 127.5, 0, 255).astype(np.uint8).tobytes()


def run(raw: bytes) -> tuple[np.ndarray, list[bool], list[bool]]:
    chan = Channelizer(RATE, CENTER)
    demod = FmDemod()
    squelch = {CH54: Squelch(), CH08: Squelch()}
    pcm = bytearray()
    open54, open08 = [], []
    iq = iq_from_u8(raw)
    for start in range(0, len(iq), BLOCK):
        out = chan.process(iq[start : start + BLOCK], [CH54, CH08])
        pcm += demod.process(out[:, 0])
        open54.append(squelch[CH54].update(channel_power(out[:, 0])))
        open08.append(squelch[CH08].update(channel_power(out[:, 1])))
    return np.frombuffer(bytes(pcm), dtype="<i2").astype(np.float32), open54, open08


def test_channelizer_output_rate():
    chan = Channelizer(RATE, CENTER)
    out = chan.process(np.zeros(BLOCK, dtype=np.complex64), [CH54, CH08])
    assert out.shape == (BLOCK // chan.decim, 2)


def test_recovers_the_tone_on_ch54():
    audio, _, _ = run(rtl_bytes(1.0))
    audio = audio[AUDIO_RATE // 10 :]  # skip the filters' start-up
    spectrum = np.abs(np.fft.rfft(audio * np.hanning(len(audio))))
    peak_hz = np.argmax(spectrum) * AUDIO_RATE / len(audio)
    assert abs(peak_hz - 1_000) < 20
    assert np.sqrt(np.mean(audio**2)) > 3_000  # clearly audible, not a whisper


def test_squelch_ignores_the_empty_channel():
    # The first 0.5 s only measure the noise floor, so start with 0.8 s of noise (2 bytes per sample), then key up.
    quiet = np.clip(np.random.default_rng(2).normal(127.5, 2.5, int(1.6 * RATE)), 0, 255).astype(np.uint8).tobytes()
    _, open54, open08 = run(quiet + rtl_bytes(0.5))
    assert not any(open54[:8]) and all(open54[-3:])
    assert not any(open08)


def test_carrier_gate_silences_the_tail():
    """When the carrier drops mid-block, the noise burst after it is muted; the voice before it is kept."""
    n = RATE // 2
    t = np.arange(n) / RATE
    carrier = 0.3 * np.exp(1j * (2 * np.pi * (CH54 - CENTER) * t + 0.8 * np.sin(2 * np.pi * 1_000 * t)))
    carrier[n // 2 :] = 0  # un-key halfway through block 2
    rng = np.random.default_rng(3)
    iq = (carrier + 0.02 * (rng.standard_normal(n) + 1j * rng.standard_normal(n))).astype(np.complex64)
    noise_only = Channelizer(RATE, CENTER).process(iq[-BLOCK:], [CH54])[:, 0]  # the last block has no carrier
    threshold = channel_power(noise_only) * 10 ** (5 / 10)  # 5 dB above the noise, like the squelch's close level
    chan, demod, rms = Channelizer(RATE, CENTER), FmDemod(), []
    for start in range(0, n, BLOCK):
        baseband = chan.process(iq[start : start + BLOCK], [CH54])[:, 0]
        audio = np.frombuffer(carrier_gate(demod.process(baseband), baseband, threshold), dtype="<i2")
        rms.append(np.sqrt(np.mean(audio.astype(np.float64) ** 2)))
    assert rms[1] > 3_000  # voice
    assert rms[3] == 0 and rms[4] == 0  # no tail


def test_noise_squelch_ignores_bleed_over():
    """Raised noise (a strong neighbour's skirt) lifts CH16's power but never quiets it: it stays shut.
    A real carrier on CH54 at the same time opens as usual."""
    ch16 = 160_350_000
    rng = np.random.default_rng(4)
    n = RATE  # 1 s: 0.5 s quiet, then 0.5 s with the bleed-over and the carrier
    noise = 0.02 * (rng.standard_normal(n) + 1j * rng.standard_normal(n))
    t = np.arange(n) / RATE
    hiss = np.convolve(rng.standard_normal(n) + 1j * rng.standard_normal(n), np.ones(64) / 64, "same")  # ~24 kHz wide
    bleed = 0.06 * hiss * np.exp(2j * np.pi * (ch16 - CENTER) * t)  # moved to CH16: ~10 dB over the floor there
    carrier = 0.3 * np.exp(1j * (2 * np.pi * (CH54 - CENTER) * t + 2 * np.sin(2 * np.pi * 1_000 * t)))
    iq = noise.copy()
    iq[n // 2 :] += bleed[n // 2 :] + carrier[n // 2 :]
    chan = Channelizer(RATE, CENTER)
    rx = {f: (FmDemod(), Squelch()) for f in (ch16, CH54)}
    opened, snr16 = {ch16: False, CH54: False}, 0.0
    for start in range(0, n, BLOCK):
        out = chan.process(iq[start : start + BLOCK].astype(np.complex64), [ch16, CH54])
        for column, f in enumerate((ch16, CH54)):
            demod, squelch = rx[f]
            demod.process(out[:, column])
            opened[f] |= squelch.update(channel_power(out[:, column]), demod.hiss)
        snr16 = max(snr16, rx[ch16][1].snr_db)
    assert snr16 > 8  # the power squelch alone would have opened
    assert not opened[ch16]
    assert opened[CH54]
