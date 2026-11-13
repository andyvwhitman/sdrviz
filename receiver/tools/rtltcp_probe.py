"""Check that an rtl_tcp server is streaming IQ, from any machine on the network.

Usage:
    python3 receiver/tools/rtltcp_probe.py <pi-host> [--port 1234] [--seconds 5]
        [--freq 160897500] [--rate 2400000]

Prints the dongle's tuner type, the measured data rate, and basic sample statistics.
If numpy is installed, it also prints a per-AAR-channel power table so you can see
which railroad channels are active. Standard library only otherwise.
"""

import argparse
import socket
import struct
import time

TUNERS = {0: "unknown", 1: "E4000", 2: "FC0012", 3: "FC0013", 4: "FC2580", 5: "R820T", 6: "R828D"}
AAR_BASE_HZ = 160_110_000
AAR_STEP_HZ = 15_000


def read_exact(sock: socket.socket, n: int) -> bytes:
    buf = bytearray()
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("rtl_tcp closed the connection")
        buf += chunk
    return bytes(buf)


def read_header(sock: socket.socket) -> tuple[str, int]:
    """rtl_tcp sends a 12-byte header: b'RTL0', tuner type, gain count (big-endian)."""
    magic, tuner, gains = struct.unpack(">4sII", read_exact(sock, 12))
    if magic != b"RTL0":
        raise ValueError(f"not an rtl_tcp server (header {magic!r})")
    return TUNERS.get(tuner, f"type {tuner}"), gains


def capture(sock: socket.socket, seconds: float) -> tuple[bytes, float]:
    """Read IQ for `seconds`; return the last ~1 s of samples and the measured byte rate."""
    keep = bytearray()
    total = 0
    start = time.monotonic()
    while (elapsed := time.monotonic() - start) < seconds:
        chunk = sock.recv(262_144)
        if not chunk:
            raise ConnectionError("rtl_tcp closed the connection")
        total += len(chunk)
        keep += chunk
        if len(keep) > 4_800_000:  # ~1 s at 2.4 MS/s (2 bytes per sample)
            del keep[: len(keep) - 4_800_000]
    return bytes(keep), total / elapsed


def sample_stats(iq: bytes) -> str:
    """Unsigned 8-bit IQ centres on 127.5; clipping at 0/255 means the gain is too high."""
    n = len(iq)
    mean = sum(iq) / n
    clipped = (iq.count(0) + iq.count(255)) / n
    rms = (sum((b - 127.5) ** 2 for b in iq[:200_000]) / min(n, 200_000)) ** 0.5
    return f"mean {mean:.1f} (expect ~127.5) · rms {rms:.1f} · clipped {clipped:.2%}"


def channel_table(iq: bytes, freq: int, rate: int) -> str:
    """Average power per AAR channel (07-97) from a 1 s FFT average. Needs numpy."""
    import numpy as np

    raw = np.frombuffer(iq, dtype=np.uint8).astype(np.float32) - 127.5
    samples = raw[0::2] + 1j * raw[1::2]
    size = 8192
    frames = samples[: len(samples) // size * size].reshape(-1, size)
    window = np.hanning(size)
    power = np.mean(np.abs(np.fft.fftshift(np.fft.fft(frames * window, axis=1), axes=1)) ** 2, axis=0)
    db = 10 * np.log10(power + 1e-12)
    floor = np.median(db)
    hz_per_bin = rate / size

    rows = []
    for ch in range(7, 98):
        offset = AAR_BASE_HZ + ch * AAR_STEP_HZ - freq
        center = int(size / 2 + offset / hz_per_bin)
        half = max(1, int(5_000 / hz_per_bin))  # +/-5 kHz around the channel
        if half <= center < size - half:
            level = float(np.max(db[center - half : center + half]) - floor)
            rows.append((ch, level))
    active = [f"CH{ch:02d} {AAR_BASE_HZ / 1e6 + ch * AAR_STEP_HZ / 1e6:.3f} +{lvl:.0f} dB" for ch, lvl in rows if lvl > 10]
    return "active channels (>10 dB above floor): " + (", ".join(active) if active else "none right now")


def main() -> None:
    parser = argparse.ArgumentParser(description=(__doc__ or "").strip().splitlines()[0])
    parser.add_argument("host")
    parser.add_argument("--port", type=int, default=1234)
    parser.add_argument("--seconds", type=float, default=5.0)
    parser.add_argument("--freq", type=int, default=160_897_500, help="center frequency the Pi is tuned to (Hz)")
    parser.add_argument("--rate", type=int, default=2_400_000, help="sample rate the Pi is using")
    args = parser.parse_args()

    with socket.create_connection((args.host, args.port), timeout=5) as sock:
        tuner, gains = read_header(sock)
        print(f"connected to {args.host}:{args.port} · tuner {tuner} · {gains} gain steps")
        iq, byte_rate = capture(sock, args.seconds)

    expected = args.rate * 2
    print(f"data rate {byte_rate / 1e6:.2f} MB/s ({byte_rate * 8 / 1e6:.0f} Mbit/s), "
          f"expected {expected / 1e6:.2f} MB/s · {byte_rate / expected:.0%}")
    print(sample_stats(iq))
    try:
        print(channel_table(iq, args.freq, args.rate))
    except ImportError:
        print("(install numpy for the per-channel activity table: pip install numpy)")


if __name__ == "__main__":
    main()
