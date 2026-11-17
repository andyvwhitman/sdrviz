"""A fake sdrviz node: connects to /ws/node and replays synthetic key-ups, spectrum rows and health.

    python tools/fake_node.py --key 'sdrviz-node1....'      # first run: enrolls, saves the node secret
    python tools/fake_node.py                                # later runs: connects with the saved secret

Audio is an Opus-encoded tone (8 kHz, 20 ms packets) on the chosen AAR channels, like the real agent will
send it. Protocol: docs/node-protocol.md. Needs the backend venv (websockets, PyAV, numpy).
"""

import argparse
import asyncio
import json
import logging
import random
import sys
import time
from pathlib import Path

import numpy as np
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.live import node_protocol as wire
from app.live import protocol
from app.live.opus import FRAME_MS, FRAME_SAMPLES, RATE, OpusEncoder

log = logging.getLogger("fake_node")

AGENT_VERSION = "fake-0.1"
CENTER_HZ, SAMPLE_RATE = 160_890_000, 1_536_000
SPECTRUM_BINS = 1024
SPECTRUM_PERIOD_S = 0.2


def aar_freq_hz(channel: int) -> int:
    return 160_215_000 + (channel - 7) * 15_000


def now_ms() -> int:
    return int(time.time() * 1000)


def spectrum_row(rng: np.random.Generator, open_channels: list[int]) -> bytes:
    """A noise floor with a bump at each open channel."""
    row = rng.normal(-95, 2, SPECTRUM_BINS)
    for channel in open_channels:
        centre = round(SPECTRUM_BINS / 2 + (aar_freq_hz(channel) - CENTER_HZ) / SAMPLE_RATE * SPECTRUM_BINS)
        if 2 <= centre < SPECTRUM_BINS - 2:
            row[centre - 2 : centre + 3] = [-80, -60, -45, -60, -80]
    return np.clip(np.round(row), -127, 0).astype(np.int8).tobytes()


def tone_packets(tone_hz: float, seconds: float) -> list[bytes]:
    """`seconds` of a sine tone as Opus packets, one per 20 ms."""
    encoder = OpusEncoder()
    t = np.arange(int(seconds * RATE)) / RATE
    pcm = (8000 * np.sin(2 * np.pi * tone_hz * t)).astype("<i2")
    return [
        encoder.encode(pcm[i : i + FRAME_SAMPLES].tobytes())
        for i in range(0, len(pcm) - FRAME_SAMPLES + 1, FRAME_SAMPLES)
    ]


class FakeNode:
    def __init__(
        self,
        state_path: Path,
        channels: list[int],
        keyup_every_s: float,
        keyup_length_s: float,
    ):
        self.state_path = state_path
        self.channels = channels
        self.keyup_every_s, self.keyup_length_s = keyup_every_s, keyup_length_s
        self.tune = wire.Tune(center_hz=CENTER_HZ, rate=SAMPLE_RATE, gain_db=36.4, squelch_db=8.0)
        self.number = 0
        self.tx_seq = 0
        self.on_air: set[int] = set()
        self.started = time.monotonic()
        self.rng = np.random.default_rng()
        self.commands: list[str] = []  # types of the commands received, for tests

    # --- state file: {url, node, secret} once enrolled ---------------------------------------------------------

    def load_state(self) -> dict | None:
        return json.loads(self.state_path.read_text()) if self.state_path.exists() else None

    def save_state(self, url: str, node: str, secret: str) -> None:
        self.state_path.write_text(json.dumps({"url": url, "node": node, "secret": secret}))
        self.state_path.chmod(0o600)

    # --- one connection ------------------------------------------------------------------------------------------

    async def run(self, key: str | None, duration_s: float = 0) -> None:
        state = self.load_state()
        if state:
            url, node, secret, mode = (
                state["url"],
                state["node"],
                state["secret"],
                "connect",
            )
        elif key:
            decoded = wire.NodeKey.decode(key)
            url, node, secret, mode = (
                decoded.url,
                decoded.node,
                decoded.secret,
                "enroll",
            )
        else:
            raise SystemExit("no saved node secret and no --key")
        ws_url = wire.NodeKey(url, node, secret).ws_url()
        async with connect(ws_url, max_size=None) as ws:
            await ws.send(wire.dump(wire.Hello(agent_version=AGENT_VERSION, node=node, mode=mode, secret=secret)))
            welcome = wire.parse_down(await ws.recv())
            if not isinstance(welcome, wire.Welcome):
                raise SystemExit(f"unexpected answer to hello: {welcome}")
            self.number = welcome.node.number
            if welcome.node_secret:
                self.save_state(url, node, welcome.node_secret)
                await ws.send(wire.dump(wire.EnrolledAck()))
                log.info("enrolled as %s (node %d)", welcome.node.name, self.number)
            if welcome.config.channels:
                self.channels = welcome.config.channels
            tasks = [
                asyncio.create_task(coro)
                for coro in (
                    self.read(ws),
                    self.heartbeat(ws),
                    self.health(ws),
                    self.spectrum(ws),
                    self.transmissions(ws),
                )
            ]
            try:
                done, _ = await asyncio.wait(
                    tasks,
                    timeout=duration_s or None,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in done:
                    task.result()  # raise what ended the run, e.g. ConnectionClosed
            finally:
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)

    async def read(self, ws) -> None:
        async for raw in ws:
            if isinstance(raw, bytes):
                continue
            message = wire.parse_down(raw)
            if isinstance(message, wire.Ping):
                await ws.send(wire.dump(wire.Pong(t=message.t, peer_t=now_ms())))
            elif isinstance(message, wire.Command):
                self.apply(message)
                await ws.send(wire.dump(wire.Ack(id=message.id, ok=True)))

    def apply(self, command: wire.Command) -> None:
        self.commands.append(command.type)
        if isinstance(command, wire.TuneCommand):
            self.tune = self.tune.model_copy(update={"center_hz": command.center_hz, "rate": command.rate})
        elif isinstance(command, wire.GainCommand):
            self.tune = self.tune.model_copy(update={"gain_db": command.gain_db})
        elif isinstance(command, wire.SquelchCommand):
            self.tune = self.tune.model_copy(update={"squelch_db": command.squelch_db})
        elif isinstance(command, wire.ChannelsCommand):
            self.channels = command.channels

    async def heartbeat(self, ws) -> None:
        while True:
            await ws.send(wire.dump(wire.Ping(t=now_ms())))
            await asyncio.sleep(wire.HEARTBEAT_S)

    async def health(self, ws) -> None:
        while True:
            health = wire.Health(
                t=now_ms(),
                cpu_pct=round(random.uniform(8, 25), 1),
                temp_c=round(random.uniform(48, 60), 1),
                rtl_tcp="connected",
                dropped_blocks=0,
                audio_age_ms=round(random.uniform(120, 220), 1),
                uptime_s=int(time.monotonic() - self.started),
                channels=len(self.channels),
                tune=self.tune,
            )
            await ws.send(wire.dump(health))
            await asyncio.sleep(wire.HEARTBEAT_S)

    async def spectrum(self, ws) -> None:
        while True:
            bins = spectrum_row(self.rng, sorted(self.on_air))
            frame = protocol.spectrum_frame(self.tune.center_hz / 1e6, self.tune.rate / 1e6, now_ms(), bins)
            await ws.send(wire.pack_frame(self.number, frame))
            await asyncio.sleep(SPECTRUM_PERIOD_S)

    async def transmissions(self, ws) -> None:
        """Every keyup_every_s a random channel keys up for keyup_length_s with its own tone."""
        while True:
            await asyncio.sleep(self.keyup_every_s)
            if self.channels:
                await self.transmit(ws, random.choice(self.channels), random.uniform(400, 1800))

    async def transmit(self, ws, channel: int, tone_hz: float) -> None:
        self.tx_seq += 1
        seq = self.tx_seq
        freq = aar_freq_hz(channel)
        await ws.send(
            wire.dump(
                wire.KeyUp(
                    ch=channel,
                    freq_hz=freq,
                    tx_seq=seq,
                    t=now_ms(),
                    snr_db=22.0,
                    power_db=-38.0,
                )
            )
        )
        self.on_air.add(channel)
        packets = tone_packets(tone_hz, self.keyup_length_s)
        for index, packet in enumerate(packets):
            flags = (protocol.FLAG_FIRST if index == 0 else 0) | (
                protocol.FLAG_LAST if index == len(packets) - 1 else 0
            )
            frame = protocol.audio_frame(channel, seq, index * FRAME_MS, flags, packet, protocol.CODEC_OPUS)
            await ws.send(wire.pack_frame(self.number, frame))
            if index % 5 == 0:
                level = wire.ChannelLevel(ch=channel, power_db=-38.0, snr_db=22.0)
                await ws.send(wire.dump(wire.Levels(t=now_ms(), open=[level])))
            await asyncio.sleep(FRAME_MS / 1000)
        self.on_air.discard(channel)
        await ws.send(wire.dump(wire.KeyDown(ch=channel, tx_seq=seq, t=now_ms())))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--key", help="node key from Settings (first run only)")
    parser.add_argument(
        "--state",
        type=Path,
        default=Path("fake-node.json"),
        help="where the node secret is kept",
    )
    parser.add_argument(
        "--channels",
        type=int,
        nargs="+",
        default=[54, 16, 8],
        help="AAR channels it keys up on",
    )
    parser.add_argument("--keyup-every", type=float, default=15, help="seconds between transmissions")
    parser.add_argument("--keyup-length", type=float, default=5, help="seconds per transmission")
    parser.add_argument(
        "--duration",
        type=float,
        default=0,
        help="stop after this many seconds (0: run until stopped)",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    node = FakeNode(args.state, args.channels, args.keyup_every, args.keyup_length)
    try:
        asyncio.run(node.run(args.key, args.duration))
    except ConnectionClosed as closed:
        log.error(
            "closed by the server: %s %s",
            closed.rcvd.code if closed.rcvd else "",
            closed.rcvd.reason if closed.rcvd else "",
        )
        sys.exit(1)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
