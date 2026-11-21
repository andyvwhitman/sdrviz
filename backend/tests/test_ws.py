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
        assert snapshot["state"]["listen_feed"] == "feed-alx" and len(snapshot["state"]["channels"]) == 9


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


def snapshot_for(ws, feed_id):
    return receive_until(
        ws, lambda m: isinstance(m, dict) and m["type"] == "snapshot" and m["state"]["listen_feed"] == feed_id
    )["state"]


def test_choosing_a_node_pushes_a_snapshot_to_that_connection(client):
    with client.websocket_connect("/ws/live") as ws:
        receive_until(ws, is_type("snapshot"))
        ws.send_text(json.dumps({"op": "listen", "feed_id": "feed-bay"}))
        assert len(snapshot_for(ws, "feed-bay")["channels"]) == 11


def test_the_listen_query_picks_the_first_snapshot_and_an_unknown_feed_falls_back(client):
    with client.websocket_connect("/ws/live?listen=feed-bay") as ws:
        assert receive_until(ws, is_type("snapshot"))["state"]["listen_feed"] == "feed-bay"
    with client.websocket_connect("/ws/live?listen=feed-x") as ws:
        assert receive_until(ws, is_type("snapshot"))["state"]["listen_feed"] == "feed-alx"


def test_two_clients_listen_to_different_nodes_and_do_not_affect_each_other(client):
    with (
        client.websocket_connect("/ws/live?listen=feed-alx") as laptop,
        client.websocket_connect("/ws/live?listen=feed-bay") as phone,
    ):
        rt = client.app.state.rt
        laptop_first = receive_until(laptop, is_type("snapshot"))["state"]
        phone_first = receive_until(phone, is_type("snapshot"))["state"]
        assert {c["id"] for c in laptop_first["channels"]} == set(rt.world.feeds["feed-alx"].hears)
        assert {c["id"] for c in phone_first["channels"]} == set(rt.world.feeds["feed-bay"].hears)

        # The phone moves to another node: the laptop's listened node does not change...
        phone.send_text(json.dumps({"op": "listen", "feed_id": "feed-lnd"}))
        snapshot_for(phone, "feed-lnd")
        assert sorted(c.listen_feed for c in rt.hub.clients) == ["feed-alx", "feed-lnd"]

        # ...and shared changes still reach both, each with its own node's channels.
        client.put("/api/frequencies/amtk-nec-road/assignments/feed-alx", json={"enabled": False})
        laptop_after = snapshot_for(laptop, "feed-alx")
        phone_after = snapshot_for(phone, "feed-lnd")
        assert "amtk-nec-road" not in {c["id"] for c in laptop_after["channels"]}
        assert {c["id"] for c in phone_after["channels"]} == set(rt.world.feeds["feed-lnd"].hears)


def test_an_ack_is_echoed_as_feed_and_faults_messages(client):
    client.post("/api/sim/jump", json={"scenario": "fault", "speed": 0})
    with client.websocket_connect("/ws/live") as ws:
        receive_until(ws, is_type("snapshot"))
        client.post("/api/feeds/feed-lnd/ack")
        feed = receive_until(ws, lambda m: isinstance(m, dict) and m["type"] == "feed" and m["acked"])
        assert feed["feed_id"] == "feed-lnd" and feed["state"] == "fault"
        faults = receive_until(ws, is_type("faults"))
        assert faults["header"]["feeds_chip"] == "FEEDS 2/4 · 1 ACK'D" and faults["faults"][0]["acked"] is True
