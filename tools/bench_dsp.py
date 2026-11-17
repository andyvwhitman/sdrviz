"""Benchmark the receiver chain (app/radio/dsp.py) on synthetic IQ: share of real time per stage.

    python tools/bench_dsp.py                       # 8, 24, 48 and 91 channels, one worker per core
    python tools/bench_dsp.py -c 91 -w 1 -b 50      # one case, one thread

Needs only numpy. Every 4th channel carries an FM voice so squelch, demod output and the carrier gate
run as they do on air. One block is 100 ms of IQ, so 100 ms of work per block is 100% of real time.
"""

import argparse
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.radio.dsp import (
    Channelizer,
    FmDemod,
    Squelch,
    iq_from_u8,
    receive,
    spectrum_dbfs,
)

BLOCK_S = 0.1
CENTER_HZ = 160_890_000
FIRST_HZ, STEP_HZ, AAR_CHANNELS = 160_215_000, 15_000, 91  # AAR 07 to 97


def channel_freqs(count: int) -> list[int]:
    """`count` AAR channels spread over the whole band."""
    picks = np.linspace(0, AAR_CHANNELS - 1, count).round().astype(int)
    return [FIRST_HZ + int(i) * STEP_HZ for i in picks]


def synthetic_blocks(rate: int, freqs: list[int], count: int) -> list[bytes]:
    """`count` blocks of rtl_tcp bytes: noise plus a voice-modulated carrier on every 4th channel."""
    rng = np.random.default_rng(1)
    n = int(rate * BLOCK_S)
    t = np.arange(n) / rate
    blocks = []
    for _ in range(count):
        iq = 0.02 * (rng.standard_normal(n) + 1j * rng.standard_normal(n))
        for freq in freqs[::4]:
            voice = rng.uniform(300, 2500)
            iq += 0.1 * np.exp(
                1j
                * (
                    2 * np.pi * (freq - CENTER_HZ) * t
                    + 2 * np.sin(2 * np.pi * voice * t)
                )
            )
        interleaved = np.empty(2 * n)
        interleaved[0::2], interleaved[1::2] = iq.real, iq.imag
        blocks.append(
            np.clip(interleaved * 127.5 + 127.5, 0, 255).astype(np.uint8).tobytes()
        )
    return blocks


def bench(channels: int, workers: int, rate: int, blocks: int) -> dict[str, float]:
    """Milliseconds per block for each stage, plus the wall time of the whole block."""
    freqs = channel_freqs(channels)
    raws = synthetic_blocks(rate, freqs, min(blocks, 10))
    channelizer = Channelizer(rate, CENTER_HZ)
    chains = {f: (Squelch(), FmDemod()) for f in freqs}
    totals = dict.fromkeys(
        (
            "u8 to complex",
            "spectrum",
            "fft (shared)",
            "extract (cpu)",
            "demod etc (cpu)",
            "wall",
        ),
        0.0,
    )

    def one_channel(block, freq):
        squelch, demod = chains[freq]
        start = time.perf_counter()
        baseband = channelizer.extract(block, freq)
        mid = time.perf_counter()
        receive(squelch, demod, baseband)
        return mid - start, time.perf_counter() - mid

    with ThreadPoolExecutor(workers) as pool:
        for number in range(
            blocks + 5
        ):  # the first blocks warm up caches and the squelch
            t0 = time.perf_counter()
            iq = iq_from_u8(raws[number % len(raws)])
            t1 = time.perf_counter()
            spectrum_dbfs(iq)
            t2 = time.perf_counter()
            block = channelizer.begin(iq)
            t3 = time.perf_counter()
            times = list(pool.map(partial(one_channel, block), freqs))
            t4 = time.perf_counter()
            if number >= 5:
                extract, demod = np.sum(times, axis=0)
                for name, seconds in zip(
                    totals,
                    (t1 - t0, t2 - t1, t3 - t2, extract, demod, t4 - t0),
                    strict=True,
                ):
                    totals[name] += seconds
    return {name: 1000 * seconds / blocks for name, seconds in totals.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "-c", "--channels", type=int, nargs="+", default=[8, 24, 48, 91]
    )
    parser.add_argument("-w", "--workers", type=int, default=os.cpu_count() or 1)
    parser.add_argument("-r", "--rate", type=int, default=1_536_000)
    parser.add_argument("-b", "--blocks", type=int, default=30)
    args = parser.parse_args()

    print(
        f"{args.rate / 1e6:.3f} MS/s, {args.workers} worker(s), {args.blocks} blocks of {BLOCK_S * 1000:.0f} ms"
    )
    for channels in args.channels:
        ms = bench(channels, args.workers, args.rate, args.blocks)
        share = 100 * ms["wall"] / (BLOCK_S * 1000)
        stages = "  ".join(
            f"{name} {value:.1f}" for name, value in ms.items() if name != "wall"
        )
        print(
            f"{channels:3d} channels: {ms['wall']:6.1f} ms/block = {share:5.1f}% of real time   [{stages}] ms"
        )


if __name__ == "__main__":
    main()
