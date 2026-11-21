"""/ws/node: handshake, heartbeat, relaying a node's audio, spectrum and key-ups to /ws/live, commands, revoke."""

import asyncio
import contextlib
import importlib.util
import json
import sys
import threading
import time
from pathlib import Path

import httpx
import pytest
import uvicorn
from sqlmodel import select
from starlette.websockets import WebSocketDisconnect
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed

from app.db import open_session
from app.live import node_protocol as wire
from app.live import protocol
from app.live.opus import OpusEncoder
from app.main import create_app
from app.models import Assignment, Frequency
from app.nodes import session as node_session

from .conftest import PASSWORD

PORT = 8161
LOCATION = {"lat": 38.9, "lon": -77.0}


def load_fake_node():
    spec = importlib.util.spec_from_file_location(
        "fake_node", Path(__file__).resolve().parents[2] / "tools/fake_node.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules["fake_node"] = module
    spec.loader.exec_module(module)
    return module


def create_node(client, name="Roof", preset="aar") -> dict:
    return client.post("/api/nodes", json={"name": name, "location": LOCATION, "preset": preset}).json()


def node_status(client, node_id) -> str:
    return client.get(f"/api/nodes/{node_id}").json()["status"]


def wait_for(condition, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if condition():
            return
        time.sleep(0.02)
    raise AssertionError("condition not met in time")


class HandNode:
    """A node played by hand over a Starlette test socket."""

    def __init__(self, client, key: str, mode="enroll", secret=None):
        decoded = wire.NodeKey.decode(key)
        self.ws = client.websocket_connect("/ws/node").__enter__()
        hello = wire.Hello(agent_version="t", node=decoded.node, mode=mode, secret=secret or decoded.secret)
        self.ws.send_text(wire.dump(hello))

    def welcome(self) -> wire.Welcome:
        message = wire.parse_down(self.ws.receive_text())
        assert isinstance(message, wire.Welcome), message
        return message

    def receive(self):
        return wire.parse_down(self.ws.receive_text())

    def send(self, message: wire.Message) -> None:
        self.ws.send_text(wire.dump(message))

    def close(self) -> None:
        """Leave the socket (a test socket that the server closed must still be left, or teardown hangs)."""
        with contextlib.suppress(WebSocketDisconnect):
            self.ws.__exit__(None, None, None)


def refused_with(client, key, **kwargs) -> int:
    node = HandNode(client, key, **kwargs)
    with pytest.raises(WebSocketDisconnect) as closed:
        node.ws.receive_text()
    node.close()
    return closed.value.code


# --- handshake -------------------------------------------------------------------------------------------------------


def test_enroll_then_reconnect_with_the_permanent_secret(client):
    created = create_node(client)
    node_id = created["node"]["id"]
    node = HandNode(client, created["key"])
    welcome = node.welcome()
    assert welcome.node.id == node_id and welcome.node.number == 1 and welcome.node_secret
    assert welcome.config.channels == list(range(7, 98))
    node.send(wire.EnrolledAck())
    wait_for(lambda: node_status(client, node_id) == "ONLINE")
    assert "node-1" in [feed["id"] for feed in client.get("/api/feeds").json()]  # an enrolled node is a feed
    node.close()
    wait_for(lambda: node_status(client, node_id) == "OFFLINE")

    again = HandNode(client, created["key"], mode="connect", secret=welcome.node_secret)
    assert again.welcome().node_secret is None
    wait_for(lambda: node_status(client, node_id) == "ONLINE")
    again.close()
    kinds = [event["kind"] for event in client.get(f"/api/nodes/{node_id}").json()["events"]]
    assert {"enrolled", "online", "offline", "reconnect"} <= set(kinds)


def test_refused_hellos_close_with_the_documented_codes(client):
    created = create_node(client)
    assert refused_with(client, created["key"], mode="connect", secret="wrong") == wire.CLOSE_UNAUTHORIZED
    assert refused_with(client, created["key"], secret="wrong") == wire.CLOSE_UNAUTHORIZED
    node = HandNode(client, created["key"])
    node.welcome()
    node.send(wire.EnrolledAck())
    wait_for(lambda: client.get("/api/nodes").json()[0]["status"] == "ONLINE")
    node.close()
    assert refused_with(client, created["key"]) == wire.CLOSE_KEY_EXPIRED  # used up


def test_first_message_must_be_a_hello(client):
    with client.websocket_connect("/ws/node") as ws:
        ws.send_text(wire.dump(wire.Ping(t=1)))
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_text()
    assert closed.value.code == wire.CLOSE_BAD_MESSAGE


def test_silent_socket_gets_the_handshake_timeout(client, monkeypatch):
    monkeypatch.setattr(node_session, "HELLO_TIMEOUT_S", 0.2)
    with client.websocket_connect("/ws/node") as ws, pytest.raises(WebSocketDisconnect) as closed:
        ws.receive_text()
    assert closed.value.code == wire.CLOSE_HANDSHAKE_TIMEOUT


def test_a_second_connection_replaces_the_first(client):
    created = create_node(client)
    first = HandNode(client, created["key"])
    secret = first.welcome().node_secret
    first.send(wire.EnrolledAck())
    wait_for(lambda: client.get("/api/nodes").json()[0]["status"] == "ONLINE")
    second = HandNode(client, created["key"], mode="connect", secret=secret)
    second.welcome()
    while True:  # the first socket was told to go
        try:
            first.ws.receive_text()
        except WebSocketDisconnect as closed:
            assert closed.code == wire.CLOSE_REPLACED
            break
    first.close()
    assert client.get("/api/nodes").json()[0]["status"] == "ONLINE"
    second.close()


# --- heartbeat and link ----------------------------------------------------------------------------------------------


def test_heartbeat_gives_link_quality_and_lag(client, monkeypatch):
    monkeypatch.setattr(wire, "HEARTBEAT_S", 0.1)
    created = create_node(client)
    node = HandNode(client, created["key"])
    node.welcome()
    node.send(wire.EnrolledAck())
    for _ in range(4):  # answer pings like a real node
        message = node.receive()
        if isinstance(message, wire.Ping):
            node.send(wire.Pong(t=message.t, peer_t=message.t))
    health = wire.Health(
        t=1, cpu_pct=10, temp_c=50, rtl_tcp="connected", dropped_blocks=0, audio_age_ms=150, uptime_s=1, channels=91,
        tune=wire.Tune(center_hz=160_890_000, rate=1_536_000, gain_db=None, squelch_db=8),
    )  # fmt: skip
    node.send(health)
    wait_for(lambda: client.get("/api/nodes").json()[0]["health"] is not None)
    info = client.get("/api/nodes").json()[0]
    assert info["status"] == "ONLINE" and info["link_quality"] >= 90
    assert 150 <= info["lag_ms"] < 400 and info["health"]["channels"] == 91
    node.close()


def test_no_beats_for_too_long_marks_the_node_offline(client, monkeypatch):
    monkeypatch.setattr(node_session, "DEAD_AFTER_S", 0.6)
    created = create_node(client)
    node = HandNode(client, created["key"])
    node.welcome()
    node.send(wire.EnrolledAck())
    wait_for(lambda: client.get("/api/nodes").json()[0]["status"] == "ONLINE")
    with pytest.raises(WebSocketDisconnect) as closed:  # the node says nothing at all
        while True:
            node.ws.receive_text()
    node.close()
    assert closed.value.code == wire.CLOSE_SERVER_ERROR
    wait_for(lambda: client.get("/api/nodes").json()[0]["status"] == "OFFLINE")


# --- commands and revoke -------------------------------------------------------------------------------------------


def test_command_is_sent_and_the_ack_comes_back(client):
    created = create_node(client)
    node_id = created["node"]["id"]
    node = HandNode(client, created["key"])
    node.welcome()
    node.send(wire.EnrolledAck())
    wait_for(lambda: node_status(client, node_id) == "ONLINE")

    results = {}

    def post(name, body):
        results[name] = client.post(f"/api/nodes/{node_id}/commands", json=body)

    for name, body, answer in (
        ("gain", {"type": "gain", "gain_db": 30.5}, wire.Ack(id="", ok=True)),
        ("tune", {"type": "tune", "center_hz": 160_000_000, "rate": 1_536_000},
         wire.Ack(id="", ok=False, error=wire.CommandError(code="failed", message="no dongle"))),
    ):  # fmt: skip
        thread = threading.Thread(target=post, args=(name, body))
        thread.start()
        command = node.receive()
        while isinstance(command, wire.Ping):
            command = node.receive()
        assert command.type == name and command.id
        node.send(answer.model_copy(update={"id": command.id}))
        thread.join(5)
    assert results["gain"].json()["status"] == "acked"
    assert results["tune"].json() == {
        "id": results["tune"].json()["id"],
        "type": "tune",
        "status": "failed",
        "error": {"code": "failed", "message": "no dongle"},
    }
    node.close()


def test_command_without_an_ack_times_out(client, monkeypatch):
    monkeypatch.setattr(node_session, "ACK_TIMEOUT_S", 0.3)
    created = create_node(client)
    node_id = created["node"]["id"]
    node = HandNode(client, created["key"])
    node.welcome()
    node.send(wire.EnrolledAck())
    wait_for(lambda: node_status(client, node_id) == "ONLINE")
    response = client.post(f"/api/nodes/{node_id}/commands", json={"type": "squelch", "squelch_db": 9})
    assert response.status_code == 200 and response.json()["status"] == "timeout"
    node.close()


def test_revoke_closes_the_socket(client):
    created = create_node(client)
    node_id = created["node"]["id"]
    node = HandNode(client, created["key"])
    node.welcome()
    node.send(wire.EnrolledAck())
    wait_for(lambda: node_status(client, node_id) == "ONLINE")
    assert client.post(f"/api/nodes/{node_id}/revoke").json()["status"] == "REVOKED"
    with pytest.raises(WebSocketDisconnect) as closed:
        while True:
            node.ws.receive_text()
    node.close()
    assert closed.value.code == wire.CLOSE_REVOKED
    assert "node-1" not in [feed["id"] for feed in client.get("/api/feeds").json()]


# --- a node's audio, spectrum and key-ups reach /ws/live -----------------------------------------------------------


def key_up(ch, seq=1, **kwargs) -> wire.KeyUp:
    return wire.KeyUp(ch=ch, freq_hz=160_920_000, tx_seq=seq, t=1, snr_db=20, power_db=-40, **kwargs)


def audio(ch, index, last=False, seq=1, packet=None) -> bytes:
    flags = (protocol.FLAG_FIRST if index == 0 else 0) | (protocol.FLAG_LAST if last else 0)
    frame = protocol.audio_frame(ch, seq, index * 20, flags, packet, protocol.CODEC_OPUS)
    return wire.pack_frame(1, frame)


def read_live(live, until) -> tuple[list[dict], list[bytes]]:
    """Read /ws/live messages (JSON texts and binary frames) until `until(texts, frames)`."""
    texts, frames = [], []
    for _ in range(1000):
        message = live.receive()
        if message.get("bytes") is not None:
            frames.append(message["bytes"])
        elif message.get("text") is not None:
            texts.append(json.loads(message["text"]))
        if until(texts, frames):
            return texts, frames
    raise AssertionError(f"did not arrive: {texts[-3:]}")


def subscribe(live, channels: list[str], feed_id: str | None) -> None:
    live.send_text(json.dumps({"op": "audio", "channels": channels}))
    if feed_id:
        live.send_text(json.dumps({"op": "watch", "feed_id": feed_id}))
    live.send_text(json.dumps({"op": "ping"}))
    read_live(live, lambda texts, _: any(t["type"] == "pong" for t in texts))  # the ops before it are applied


def enable_all(client, feed_id: str) -> None:
    """Every frequency enabled on the feed, as if the admin had assigned them all."""
    rt = client.app.state.rt
    with open_session(rt.db) as session:
        session.add_all(Assignment(frequency_id=f, feed_id=feed_id) for f in session.exec(select(Frequency.id)))
        session.commit()
    rt.reload_world()


def enrolled_node(client, enable: bool = True) -> tuple[HandNode, str]:
    created = create_node(client)
    node = HandNode(client, created["key"])
    node.welcome()
    node.send(wire.EnrolledAck())
    wait_for(lambda: node_status(client, created["node"]["id"]) == "ONLINE")
    if enable:
        enable_all(client, created["node"]["feed_id"])
    return node, created["node"]["id"]


def channel_id(client, aar_channel: int) -> str:
    return next(f for f in client.get("/api/frequencies").json() if f["aar_channel"] == aar_channel)["id"]


def test_node_traffic_appears_on_ws_live(client):
    node, _ = enrolled_node(client)
    channel = channel_id(client, 54)
    encoder = OpusEncoder()
    packets = [encoder.encode(b"\x00\x10" * 160) for _ in range(11)]  # 220 ms
    with client.websocket_connect("/ws/live") as live:
        subscribe(live, [channel], "node-1")

        node.send(key_up(54))
        texts, _ = read_live(live, lambda texts, _: any(t["type"] == "keyup" for t in texts))
        keyup = next(t for t in texts if t["type"] == "keyup")
        assert keyup["channel_id"] == channel and keyup["feed_id"] == "node-1" and keyup["tx_seq"] > 2_000_000_000
        assert keyup["receptions"][0]["feed_id"] == "node-1"

        for index, packet in enumerate(packets):
            node.ws.send_bytes(audio(54, index, last=index == len(packets) - 1, packet=packet))
        node.ws.send_bytes(wire.pack_frame(1, protocol.spectrum_frame(160.89, 1.536, 5, bytes(range(100)))))
        node.ws.send_bytes(wire.pack_frame(2, protocol.spectrum_frame(160.89, 1.536, 5, bytes(100))))  # not its number
        node.send(wire.Levels(t=1, open=[wire.ChannelLevel(ch=54, power_db=-33.0, snr_db=21.0)]))
        node.send(wire.KeyDown(ch=54, tx_seq=1, t=2))
        texts, frames = read_live(live, lambda texts, _: any(t["type"] == "keydown" for t in texts))

    parsed = [wire.parse_frame(f) for f in frames]
    spectra = [f for f in parsed if isinstance(f, wire.SpectrumFrame)]
    chunks = [f for f in parsed if isinstance(f, wire.AudioFrame)]
    assert len(spectra) == 1 and spectra[0].bins == bytes(range(100))
    assert [c.codec for c in chunks] == [protocol.CODEC_PCM] * 3  # about 220 ms: 100 + 100 + the rest
    assert [c.offset_ms for c in chunks] == [0, 100, 200]
    assert [(c.first, c.last) for c in chunks] == [(True, False), (False, False), (False, True)]
    assert [len(c.payload) for c in chunks[:2]] == [protocol.CHUNK_BYTES] * 2 and 0 < len(chunks[2].payload) <= 320
    assert len({c.tx_seq for c in chunks}) == 1 and chunks[0].ch == 54
    assert any(t["type"] == "level" and channel in t["levels"] for t in texts)
    assert next(t for t in texts if t["type"] == "keydown")["channel_id"] == channel
    node.close()


def test_first_key_up_wins_between_two_nodes_and_the_lan_receiver(client):
    node_a, _ = enrolled_node(client)
    node_b, _ = enrolled_node(client)  # a second node: number 2
    channel = channel_id(client, 54)
    radio = client.app.state.rt.radio
    with client.websocket_connect("/ws/live") as live:
        subscribe(live, [channel], None)
        node_a.send(key_up(54))
        read_live(live, lambda texts, _: any(t["type"] == "keyup" for t in texts))
        node_b.send(key_up(54, seq=9))  # refused: A has the channel
        packet = OpusEncoder().encode(b"\x00\x10" * 160)
        node_b.ws.send_bytes(
            wire.pack_frame(
                2, protocol.audio_frame(54, 9, 0, protocol.FLAG_FIRST | protocol.FLAG_LAST, packet, protocol.CODEC_OPUS)
            )
        )
        node_b.send(wire.KeyDown(ch=54, tx_seq=9, t=2))  # B's key-down must not end A's transmission
        node_b.send(wire.Ping(t=1))
        assert isinstance(node_b.receive(), (wire.Pong, wire.Ping))
        assert radio.events.on_air[channel].feed_id == "node-1"
        # the LAN receiver is refused as well, and its audio is dropped
        assert radio.events.key_up(channel, 5, 20.0, -40.0) is False
        assert not radio.events.owns(channel, "feed-live")

        # a LAN transmission on another channel is not affected by the nodes
        other = channel_id(client, 16)
        assert radio.events.key_up(other, 6, 20.0, -40.0) is True
        node_a.send(wire.KeyDown(ch=54, tx_seq=1, t=3))
        read_live(live, lambda texts, _: any(t["type"] == "keydown" and t["channel_id"] == channel for t in texts))
        assert other in radio.events.on_air and channel not in radio.events.on_air
        # B starts again afterwards and gets the channel
        node_b.send(key_up(54, seq=10))
        read_live(live, lambda texts, _: any(t["type"] == "keyup" and t["feed_id"] == "node-2" for t in texts))
    node_a.close()
    node_b.close()


def test_a_dropped_node_ends_its_transmission(client):
    node, node_id = enrolled_node(client)
    channel = channel_id(client, 54)
    with client.websocket_connect("/ws/live") as live:
        node.send(key_up(54))
        read_live(live, lambda texts, _: any(t["type"] == "keyup" for t in texts))
        node.close()
        read_live(live, lambda texts, _: any(t["type"] == "keydown" and t["channel_id"] == channel for t in texts))
    wait_for(lambda: node_status(client, node_id) == "OFFLINE")


# --- the fake node against a real server ---------------------------------------------------------------------------


@pytest.fixture
def server(settings):
    app = create_app(settings.model_copy(update={"public_url": f"http://127.0.0.1:{PORT}"}))
    config = uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning")
    uvicorn_server = uvicorn.Server(config)
    thread = threading.Thread(target=uvicorn_server.run, daemon=True)
    thread.start()
    wait_for(lambda: uvicorn_server.started, 10)
    yield f"http://127.0.0.1:{PORT}"
    uvicorn_server.should_exit = True
    thread.join(10)


def test_fake_node_end_to_end(server, tmp_path):
    fake_node = load_fake_node()

    async def scenario():
        async with httpx.AsyncClient(base_url=server) as http:
            assert (await http.post("/api/auth/login", json={"password": PASSWORD})).status_code == 204
            created = (await http.post("/api/nodes", json={"name": "Roof", "location": LOCATION})).json()
            node_id, key = created["node"]["id"], created["key"]
            freqs = [f["id"] for f in (await http.get("/api/frequencies")).json()]
            cookie = "; ".join(f"{k}={v}" for k, v in http.cookies.items())

            async def status() -> str:
                return (await http.get(f"/api/nodes/{node_id}")).json()["status"]

            async def until(wanted: str, timeout=10.0):
                deadline = time.monotonic() + timeout
                while time.monotonic() < deadline:
                    if await status() == wanted:
                        return
                    await asyncio.sleep(0.05)
                raise AssertionError(f"never {wanted}, now {await status()}")

            state = tmp_path / "node.json"
            node = fake_node.FakeNode(state, [54], keyup_every_s=0.2, keyup_length_s=0.5)
            run = asyncio.create_task(node.run(key))
            await until("ONLINE")
            assert json.loads(state.read_text())["node"] == node_id
            assigned = await http.put("/api/frequencies/amtk-nec-road/assignments/node-1", json={"enabled": True})
            assert assigned.status_code == 200  # CH54, where the fake node keys up

            async with connect(
                server.replace("http", "ws") + "/ws/live", additional_headers={"Cookie": cookie}
            ) as live:
                await live.send(json.dumps({"op": "audio", "channels": freqs}))
                await live.send(json.dumps({"op": "watch", "feed_id": "node-1"}))
                texts, kinds = [], set()
                deadline = time.monotonic() + 8
                while time.monotonic() < deadline and not {"audio", "spectrum", "keyup", "keydown"} <= kinds:
                    message = await asyncio.wait_for(live.recv(), 5)
                    if isinstance(message, bytes):
                        kinds.add({protocol.KIND_AUDIO: "audio", protocol.KIND_SPECTRUM: "spectrum"}[message[0]])
                        if message[0] == protocol.KIND_AUDIO:
                            assert message[1] == protocol.CODEC_PCM
                    else:
                        texts.append(json.loads(message))
                        kinds.add(texts[-1]["type"])
                assert {"audio", "spectrum", "keyup", "keydown"} <= kinds
            info = (await http.get(f"/api/nodes/{node_id}")).json()
            assert (
                info["status"] == "ONLINE" and info["link_quality"] is not None and info["agent_version"] == "fake-0.1"
            )

            # the node socket dies: OFFLINE
            run.cancel()
            await asyncio.gather(run, return_exceptions=True)
            await until("OFFLINE")

            # the permanent secret reconnects it; revoking closes the socket with 4403
            second = fake_node.FakeNode(state, [], keyup_every_s=60, keyup_length_s=1)
            run = asyncio.create_task(second.run(None))
            await until("ONLINE")
            assert (await http.post(f"/api/nodes/{node_id}/revoke")).json()["status"] == "REVOKED"
            with pytest.raises(ConnectionClosed) as closed:
                await asyncio.wait_for(run, 5)
            assert closed.value.rcvd.code == wire.CLOSE_REVOKED

    asyncio.run(scenario())


# --- commands from the server ------------------------------------------------------------------------------


def next_command(node: HandNode):
    message = node.receive()
    while isinstance(message, wire.Ping):
        message = node.receive()
    return message


# --- the assigned preset ---------------------------------------------------------------------------------------------


def assign(client, freq_id: str, enabled: bool = True, feed_id: str = "node-1"):
    return client.put(f"/api/frequencies/{freq_id}/assignments/{feed_id}", json={"enabled": enabled})


def test_assigned_preset_node_follows_its_assignments(client):
    created = create_node(client, preset="assigned")
    node_id = created["node"]["id"]
    node = HandNode(client, created["key"])
    assert node.welcome().config.channels == []  # nothing assigned yet
    node.send(wire.EnrolledAck())
    wait_for(lambda: node_status(client, node_id) == "ONLINE")

    assert assign(client, "amtk-nec-road").status_code == 200  # CH54
    pushed = next_command(node)
    assert pushed.type == "channels" and pushed.channels == [54]
    node.send(wire.Ack(id=pushed.id, ok=True))

    assert assign(client, "amtk-nec-road").status_code == 200  # no change: no push
    assert assign(client, "csx-road").status_code == 200
    pushed = next_command(node)
    channels = client.get("/api/frequencies/csx-road").json()["aar_channel"]
    assert pushed.channels == sorted([54, channels])
    node.send(wire.Ack(id=pushed.id, ok=True))

    assign(client, "csx-road", enabled=False)  # disabled: the node stops decoding it
    pushed = next_command(node)
    assert pushed.channels == [54]
    node.send(wire.Ack(id=pushed.id, ok=True))

    assign(client, "amtk-nec-road", enabled=False)  # an empty list is not sent: the node keeps its last one
    assert client.app.state.rt.nodes.channels_for(client.app.state.rt.nodes.list()[0]) == []
    assign(client, "csx-road")
    pushed = next_command(node)  # the first command after the empty list is the next real one
    assert pushed.channels == [channels]
    node.close()


def test_a_reconnecting_node_gets_its_list_in_welcome_and_as_a_command(client):
    created = create_node(client, preset="assigned")
    node_id = created["node"]["id"]
    node = HandNode(client, created["key"])
    secret = node.welcome().node_secret
    node.send(wire.EnrolledAck())
    wait_for(lambda: node_status(client, node_id) == "ONLINE")
    node.close()
    wait_for(lambda: node_status(client, node_id) == "OFFLINE")
    assign(client, "amtk-nec-road")  # changed while it was offline

    again = HandNode(client, created["key"], mode="connect", secret=secret)
    assert again.welcome().config.channels == [54]
    command = next_command(again)
    assert command.type == "channels" and command.channels == [54]
    again.close()


def test_a_key_up_on_a_channel_not_enabled_on_the_node_is_ignored(client):
    node, _ = enrolled_node(client, enable=False)
    assign(client, "amtk-nec-road")
    with client.websocket_connect("/ws/live") as live:
        subscribe(live, [], None)
        node.send(key_up(66))  # not assigned
        node.send(key_up(54))
        texts, _ = read_live(live, lambda texts, _: any(t["type"] == "keyup" for t in texts))
        assert [t["aar"] for t in texts if t["type"] == "keyup"] == ["CH54"]
    node.close()


# --- the node's health fills its feed's telemetry --------------------------------------------------


def node_health(rtl_tcp="connected", temp_c=51.5):
    return wire.Health(
        t=1, cpu_pct=37.4, temp_c=temp_c, rtl_tcp=rtl_tcp, dropped_blocks=3, audio_age_ms=40, uptime_s=9, channels=4,
        tune=wire.Tune(center_hz=160_890_000, rate=1_536_000, gain_db=None, squelch_db=8),
    )  # fmt: skip


def node_feed(client) -> dict:
    return next(f for f in client.get("/api/live/state").json()["feeds"] if f["id"] == "node-1")


def test_node_health_fills_the_feed_telemetry_and_state(client):
    node, node_id = enrolled_node(client)
    assert node_feed(client)["telemetry"] == {"host_cpu_pct": None, "host_temp_c": None, "device_drops": None}
    node.send(node_health())
    wait_for(lambda: node_feed(client)["telemetry"]["host_cpu_pct"] == 37.4)
    feed = node_feed(client)
    assert feed["telemetry"] == {"host_cpu_pct": 37.4, "host_temp_c": 51.5, "device_drops": 3}
    assert "device_temp_c" not in feed["telemetry"]  # the node does not report the dongle's temperature
    assert feed["state"] == "ok" and feed["sim"] is False

    node.send(node_health(rtl_tcp="down", temp_c=None))
    wait_for(lambda: node_feed(client)["state"] == "stale")
    feed = node_feed(client)
    assert feed["label"] == "STALE · RTL_TCP DOWN" and feed["telemetry"]["host_temp_c"] is None

    node.close()
    wait_for(lambda: node_status(client, node_id) == "OFFLINE")
    feed = node_feed(client)
    assert feed["state"] == "offline" and feed["telemetry"] == {
        "host_cpu_pct": None, "host_temp_c": None, "device_drops": None,
    }  # fmt: skip


def node_channels(client) -> list[dict]:
    state = client.get("/api/live/state", params={"listen_feed": "node-1"}).json()
    return [c for c in state["channels"] if "node-1" in c["heard_by"]]


def test_tiles_follow_the_node_state_not_the_replay(client):
    node, _ = enrolled_node(client)
    try:
        node.send(node_health())
        wait_for(lambda: node_feed(client)["state"] == "ok")
        channels = node_channels(client)
        assert channels and all(c["coverage"]["state"] == "ok" for c in channels)

        node.send(node_health(rtl_tcp="down"))
        wait_for(lambda: node_feed(client)["state"] == "stale")
        channels = node_channels(client)
        pips = [p for c in channels for p in c["coverage"]["pips"] if p["feed_id"] == "node-1"]
        assert pips and all(p["state"] == "stale" for p in pips)
        only_node = [c for c in channels if c["heard_by"] == ["node-1"] and c["state"] != "tx"]
        assert all(c["coverage"]["state"] == "stale" and c["status_readout"].startswith("AGE ") for c in only_node)
    finally:
        node.close()
