"""/ws/live over a real (test) socket. The clock is frozen at 14:07:30 with three channels keyed."""

import json
import struct

import pytest
from starlette.websockets import WebSocketDisconnect


def receive_until(ws, wanted, limit: int = 200):
    """Read messages until `wanted(message)` is true; returns it. Bounded so a bug fails instead of hanging."""
    for _ in range(limit):
        message = ws.receive()
        item = message.get("text") or message.get("bytes")
        parsed = json.loads(item) if isinstance(item, str) else item
        if wanted(parsed):
            return parsed
    raise AssertionError("expected message never arrived")


def is_type(name):
    return lambda m: isinstance(m, dict) and m["type"] == name


def test_unauthenticated_socket_is_closed_with_4401(anonymous):
    with pytest.raises(WebSocketDisconnect) as closed, anonymous.websocket_connect("/ws/live") as ws:
        ws.receive_text()
    assert closed.value.code == 4401


def test_hello_then_snapshot(client):
    with client.websocket_connect("/ws/live") as ws:
        hello = json.loads(ws.receive_text())
        assert hello["type"] == "hello" and hello["protocol"] == 1
        assert hello["sim"]["clock"] == "14:07:30" and hello["sim"]["speed"] == 0.0 and hello["server_time"]
        snapshot = json.loads(ws.receive_text())
        assert snapshot["type"] == "snapshot" and snapshot["state"]["clock"] == "14:07:30"
        assert len(snapshot["state"]["channels"]) == 31


def test_ping_is_answered(client):
    with client.websocket_connect("/ws/live") as ws:
        ws.send_text(json.dumps({"op": "ping"}))
        assert receive_until(ws, is_type("pong"))["type"] == "pong"


def test_one_hz_tick_and_ten_hz_levels_while_keyed(client):
    with client.websocket_connect("/ws/live") as ws:
        tick = receive_until(ws, is_type("tick"))
        assert tick["clock"] == "14:07:30" and tick["speed"] == 0.0
        level = receive_until(ws, is_type("level"))
        assert set(level["levels"]) == {"amtk-nec-road", "csx-road", "csx-be-disp"}
        assert all(set(v) == {"db", "peak"} for v in level["levels"].values())


def test_spectrum_frames_only_for_the_watched_feed(client):
    with client.websocket_connect("/ws/live") as ws:
        ws.send_text(json.dumps({"op": "watch", "feed_id": "feed-bay"}))
        frame = receive_until(ws, lambda m: isinstance(m, bytes))
        kind, flags, n_bins, center, span, t_ms = struct.unpack(">BBHffI", frame[:16])
        assert (kind, n_bins) == (2, 1024) and len(frame) == 16 + 1024
        assert center == pytest.approx(160.89) and span == pytest.approx(2.4) and t_ms == 50_850_000


def test_jump_pushes_a_new_snapshot_to_connected_clients(client):
    with client.websocket_connect("/ws/live") as ws:
        receive_until(ws, is_type("snapshot"))
        client.post("/api/sim/jump", json={"scenario": "listening", "speed": 0})
        snapshot = receive_until(
            ws, lambda m: isinstance(m, dict) and m["type"] == "snapshot" and m["state"]["clock"] == "03:40:00"
        )
        assert snapshot["state"]["scenario"] == "listening" and snapshot["state"]["active_transmissions"] == []


def test_bank_activation_pushes_a_snapshot(client):
    with client.websocket_connect("/ws/live") as ws:
        receive_until(ws, is_type("snapshot"))
        client.post("/api/banks/bank-freight/activate")
        snapshot = receive_until(
            ws,
            lambda m: isinstance(m, dict) and m["type"] == "snapshot" and m["state"]["active_bank"] == "bank-freight",
        )
        assert snapshot["state"]["displayed_feed"] == "feed-bay"


def test_an_ack_is_echoed_as_feed_and_faults_messages(client):
    client.post("/api/sim/jump", json={"scenario": "fault", "speed": 0})
    with client.websocket_connect("/ws/live") as ws:
        receive_until(ws, is_type("snapshot"))
        client.post("/api/feeds/feed-lnd/ack")
        feed = receive_until(ws, lambda m: isinstance(m, dict) and m["type"] == "feed" and m["acked"])
        assert feed["feed_id"] == "feed-lnd" and feed["state"] == "fault"
        faults = receive_until(ws, is_type("faults"))
        assert faults["header"]["feeds_chip"] == "FEEDS 2/4 · 1 ACK'D" and faults["faults"][0]["acked"] is True
