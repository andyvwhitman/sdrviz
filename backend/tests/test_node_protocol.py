"""The node uplink wire format: messages, node key, binary frames, Opus, and the fake node against a stub server."""

import asyncio
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from pydantic import ValidationError
from websockets.asyncio.server import serve

from app.live import node_protocol as wire
from app.live import protocol
from app.live.opus import FRAME_SAMPLES, RATE, OpusDecoder, OpusEncoder

TUNE = wire.Tune(center_hz=160_890_000, rate=1_536_000, gain_db=36.4, squelch_db=8.0)

UP = [
    wire.Ping(t=1),
    wire.Pong(t=1, peer_t=2),
    wire.Hello(agent_version="0.1", node="node-abc", mode="enroll", secret="s3cret"),
    wire.EnrolledAck(),
    wire.KeyUp(ch=54, freq_hz=160_920_000, tx_seq=7, t=1_000, snr_db=21.5, power_db=-40.0),
    wire.KeyDown(ch=54, tx_seq=7, t=2_000),
    wire.Levels(t=1_100, open=[wire.ChannelLevel(ch=54, power_db=-40.0, snr_db=21.5)]),
    wire.Health(
        t=1,
        cpu_pct=12.5,
        temp_c=51.0,
        rtl_tcp="connected",
        dropped_blocks=0,
        audio_age_ms=130.0,
        uptime_s=60,
        channels=91,
        tune=TUNE,
    ),
    wire.Ack(id="c1", ok=True),
    wire.Ack(id="c2", ok=False, error=wire.CommandError(code="bad_value", message="rate must be a multiple of 48000")),
]
DOWN = [
    wire.Ping(t=1),
    wire.Welcome(
        node=wire.WelcomeNode(id="node-abc", number=3, name="Roof"),
        server_time=5,
        config=wire.NodeConfig(channels=[8, 16, 54]),
        node_secret="permanent",
    ),
    wire.TuneCommand(id="c1", center_hz=160_890_000, rate=1_536_000),
    wire.GainCommand(id="c2", gain_db=None),
    wire.SquelchCommand(id="c3", squelch_db=10.0),
    wire.ChannelsCommand(id="c4", channels=[54]),
    wire.RestartCommand(id="c5"),
    wire.SetServerCommand(id="c6", url="https://new.example.com"),
]


@pytest.mark.parametrize("message", UP, ids=lambda m: m.type)
def test_up_messages_round_trip(message):
    assert wire.parse_up(wire.dump(message)) == message


@pytest.mark.parametrize("message", DOWN, ids=lambda m: m.type)
def test_down_messages_round_trip(message):
    assert wire.parse_down(wire.dump(message)) == message


def test_auto_gain_stays_in_the_json_as_null():
    assert json.loads(wire.dump(wire.GainCommand(id="c", gain_db=None)))["gain_db"] is None


def test_unknown_or_malformed_messages_are_rejected():
    for text in ('{"type":"nope"}', '{"type":"key_up"}', "not json", '{"ch":1}'):
        with pytest.raises(ValidationError):
            wire.parse_up(text)


def test_unknown_fields_are_ignored():
    assert wire.parse_up('{"type":"ping","t":5,"future":true}') == wire.Ping(t=5)


def test_node_key_round_trip():
    key = wire.NodeKey("https://sdr.example.com", "node-abc", "x" * 43)
    text = key.encode()
    assert text.startswith("sdrviz-node1.") and "=" not in text
    assert wire.NodeKey.decode(f"  {text}\n") == key
    assert key.ws_url() == "wss://sdr.example.com/ws/node"
    assert wire.NodeKey("http://localhost:8100/", "n", "s").ws_url() == "ws://localhost:8100/ws/node"


@pytest.mark.parametrize("bad", ["", "sdrviz-node2.abcd", "sdrviz-node1.!!!", "sdrviz-node1.e30", "hello"])
def test_bad_node_keys_are_rejected(bad):
    with pytest.raises(ValueError):
        wire.NodeKey.decode(bad)


def test_binary_frames_round_trip():
    audio = protocol.audio_frame(54, 7, 40, protocol.FLAG_FIRST, b"opus-bytes", protocol.CODEC_OPUS)
    number, inner = wire.unpack_frame(wire.pack_frame(513, audio))
    assert number == 513
    assert wire.parse_frame(inner) == wire.AudioFrame(
        protocol.CODEC_OPUS, 54, protocol.FLAG_FIRST, 7, 40, b"opus-bytes"
    )
    assert wire.parse_frame(inner).first and not wire.parse_frame(inner).last

    bins = bytes(range(10))
    spectrum = wire.parse_frame(protocol.spectrum_frame(160.89, 1.536, 123_456, bins))
    assert spectrum.bins == bins and spectrum.t_ms == 123_456 and abs(spectrum.span_mhz - 1.536) < 1e-6


def test_short_or_unknown_frames_raise():
    for data in (b"", b"\x00"):
        with pytest.raises(ValueError):
            wire.unpack_frame(data)
    for frame in (b"\x09\x00\x00", b"\x01\x00", protocol.spectrum_frame(1, 1, 0, b"abc")[:-1]):
        with pytest.raises(ValueError):
            wire.parse_frame(frame)


def test_pcm_frames_are_unchanged_by_the_codec_argument():
    assert protocol.audio_frame(8, 1, 0, 0, b"ab") == protocol.audio_frame(8, 1, 0, 0, b"ab", protocol.CODEC_PCM)


def test_opus_round_trip_keeps_the_tone():
    tone = (8000 * np.sin(2 * np.pi * 1_000 * np.arange(RATE) / RATE)).astype("<i2")
    encoder, decoder = OpusEncoder(), OpusDecoder()
    packets = [encoder.encode(tone[i : i + FRAME_SAMPLES].tobytes()) for i in range(0, RATE, FRAME_SAMPLES)]
    assert len(packets) == 50 and max(map(len, packets)) < 120  # about 12 kbit/s
    audio = np.frombuffer(b"".join(decoder.decode(p) for p in packets), dtype="<i2")[1_000:].astype(float)
    peak_hz = np.argmax(np.abs(np.fft.rfft(audio * np.hanning(len(audio))))) * RATE / len(audio)
    assert abs(peak_hz - 1_000) < 10
    assert 4_000 < np.sqrt(np.mean(audio**2)) < 7_000


def test_opus_encoder_wants_20_ms():
    with pytest.raises(ValueError):
        OpusEncoder().encode(b"\x00" * 10)


def load_fake_node():
    spec = importlib.util.spec_from_file_location(
        "fake_node", Path(__file__).resolve().parents[2] / "tools/fake_node.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules["fake_node"] = module
    spec.loader.exec_module(module)
    return module


def test_fake_node_enrolls_then_streams_what_the_protocol_defines(tmp_path):
    """A stub server plays the BE-5 side: welcome with a node secret, then reads what the fake node sends."""
    fake_node = load_fake_node()
    texts, frames = [], []

    async def stub(ws):
        hello = wire.parse_up(await ws.recv())
        assert hello.mode == "enroll" and hello.secret == "enrol-secret"
        welcome = wire.Welcome(
            node=wire.WelcomeNode(id="node-abc", number=9, name="Roof"),
            server_time=1,
            config=wire.NodeConfig(channels=[54]),
            node_secret="permanent",
        )
        await ws.send(wire.dump(welcome))
        async for raw in ws:
            (frames if isinstance(raw, bytes) else texts).append(raw)

    async def scenario():
        async with serve(stub, "127.0.0.1", 0) as server:
            port = server.sockets[0].getsockname()[1]
            key = wire.NodeKey(f"http://127.0.0.1:{port}", "node-abc", "enrol-secret").encode()
            node = fake_node.FakeNode(tmp_path / "node.json", [8], keyup_every_s=0.05, keyup_length_s=0.2)
            await node.run(key, duration_s=1.0)
            return node

    node = asyncio.run(scenario())
    kinds = [wire.parse_up(t).type for t in texts]
    assert kinds[0] == "enrolled_ack" and {"ping", "health", "key_up", "levels", "key_down"} <= set(kinds)
    assert json.loads((tmp_path / "node.json").read_text())["secret"] == "permanent"  # saved for the next start
    assert node.channels == [54]  # the welcome's channel list replaced the default

    parsed = [(n, wire.parse_frame(f)) for n, f in map(wire.unpack_frame, frames)]
    assert {n for n, _ in parsed} == {9}
    audio = [f for _, f in parsed if isinstance(f, wire.AudioFrame)]
    assert audio and audio[0].first and audio[0].codec == protocol.CODEC_OPUS and audio[0].ch == 54
    assert any(isinstance(f, wire.SpectrumFrame) and len(f.bins) == 1024 for _, f in parsed)
    decoder = OpusDecoder()
    assert len(decoder.decode(audio[0].payload)) in (FRAME_SAMPLES * 2, FRAME_SAMPLES * 2 - 32)  # resampler delay
