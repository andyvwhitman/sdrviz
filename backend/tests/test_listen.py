"""G-5: hold to listen. A held channel joins the node's decode list, streams to the holder, is never recorded."""

import json

from sqlmodel import select

from app.db import open_session
from app.live import node_protocol as wire
from app.live import protocol
from app.live.listen import HOLD_TTL_S
from app.live.opus import OpusEncoder
from app.recordings.models import Recording

from .test_node_ws import (
    HandNode,
    assign,
    audio,
    create_node,
    key_up,
    next_command,
    node_status,
    read_live,
    wait_for,
)

CH = 33  # a channel with no frequency in the table


def online_node(client, preset="assigned") -> HandNode:
    created = create_node(client, preset=preset)
    node = HandNode(client, created["key"])
    node.welcome()
    node.send(wire.EnrolledAck())
    wait_for(lambda: node_status(client, created["node"]["id"]) == "ONLINE")
    return node


def op(live, **message) -> list[dict]:
    """Send a client op, then a ping, and return the JSON messages that came before the pong."""
    live.send_text(json.dumps(message))
    live.send_text(json.dumps({"op": "ping"}))
    texts, _ = read_live(live, lambda texts, _: any(t["type"] == "pong" for t in texts))
    return [t for t in texts if t["type"] == "listen_state"]


def ack(node, command) -> None:
    node.send(wire.Ack(id=command.id, ok=True))


def states(live) -> list[dict]:
    texts, _ = read_live(live, lambda texts, _: any(t["type"] == "listen_state" for t in texts))
    return [t for t in texts if t["type"] == "listen_state"]


def test_hold_tunes_the_node_then_listens_and_release_gives_the_channel_back(client):
    node = online_node(client)
    assign(client, "amtk-nec-road")  # CH54
    ack(node, next_command(node))
    with client.websocket_connect("/ws/live") as live:
        (tuning,) = op(live, op="listen_hold", feed_id="node-1", aar_channel=CH)
        assert tuning == {"type": "listen_state", "feed_id": "node-1", "aar_channel": CH, "state": "tuning"}
        command = next_command(node)
        assert command.type == "channels" and command.channels == [CH, 54]
        ack(node, command)
        assert states(live)[-1]["state"] == "listening"

        (released,) = op(live, op="listen_release", feed_id="node-1", aar_channel=CH)
        assert released["state"] == "released" and released["reason"] == "released"
        command = next_command(node)
        assert command.channels == [54]
        ack(node, command)
    node.close()


def test_held_audio_reaches_the_holder_by_aar_channel_and_is_never_recorded(client):
    node = online_node(client)
    assign(client, "amtk-nec-road")
    ack(node, next_command(node))
    other_client_audio = []
    with client.websocket_connect("/ws/live") as live, client.websocket_connect("/ws/live") as bystander:
        op(live, op="listen_hold", feed_id="node-1", aar_channel=CH)
        ack(node, next_command(node))
        encoder = OpusEncoder()
        node.send(key_up(CH))
        packets = [encoder.encode(b"\x00\x10" * 160) for _ in range(11)]
        for index, packet in enumerate(packets):
            node.ws.send_bytes(audio(CH, index, last=index == len(packets) - 1, packet=packet))
        node.send(wire.KeyDown(ch=CH, tx_seq=1, t=2))
        texts, frames = read_live(live, lambda t, f: len([x for x in f if x[0] == protocol.KIND_AUDIO]) >= 3)
        chunks = [wire.parse_frame(f) for f in frames if f[0] == protocol.KIND_AUDIO]
        assert [c.ch for c in chunks] == [CH] * 3 and chunks[0].first and chunks[-1].last
        assert not any(t["type"] in ("keyup", "keydown") for t in texts)  # not a tile, not a transcript row
        _, other_client_audio = read_live(bystander, lambda t, f: any(x["type"] == "snapshot" for x in t))
    client.app.state.rt.recorder.flush()
    with open_session(client.app.state.rt.db) as session:
        assert session.exec(select(Recording)).all() == []
    assert not [f for f in other_client_audio if f[0] == protocol.KIND_AUDIO]
    node.close()


def test_a_channel_that_is_enabled_is_recorded_and_still_streams_to_holders(client):
    node = online_node(client)
    assign(client, "amtk-nec-road")
    ack(node, next_command(node))
    with client.websocket_connect("/ws/live") as live:
        (state,) = op(live, op="listen_hold", feed_id="node-1", aar_channel=54)
        assert state["state"] == "listening"  # the node decodes it already: no push, no wait
        node.send(key_up(54))
        encoder = OpusEncoder()
        for index in range(5):
            node.ws.send_bytes(audio(54, index, last=index == 4, packet=encoder.encode(b"\x00\x10" * 160)))
        node.send(wire.KeyDown(ch=54, tx_seq=1, t=2))
        _, frames = read_live(live, lambda t, f: any(x[0] == protocol.KIND_AUDIO for x in f))
        assert wire.parse_frame(frames[-1]).ch == 54
    wait_for(lambda: client.app.state.rt.recorder.flush() is None and client.get("/api/recordings").json())
    node.close()


def test_a_hold_not_renewed_is_dropped_and_a_renewal_keeps_it(client):
    node = online_node(client)
    assign(client, "amtk-nec-road")
    ack(node, next_command(node))
    rt = client.app.state.rt
    now = [1000.0]
    rt.listening.clock = lambda: now[0]
    with client.websocket_connect("/ws/live") as live:
        op(live, op="listen_hold", feed_id="node-1", aar_channel=CH)
        ack(node, next_command(node))
        now[0] += HOLD_TTL_S - 1
        op(live, op="listen_hold", feed_id="node-1", aar_channel=CH)  # the 5 s renewal
        now[0] += HOLD_TTL_S - 1
        rt.listening.sweep()
        assert rt.listening.channels("node-1") == {CH}
        now[0] += 2
        rt.listening.sweep()
        assert rt.listening.channels("node-1") == set()
        (expired,) = [t for t in states(live) if t["state"] == "released"]
        assert expired["reason"] == "timeout"
        command = next_command(node)
        assert command.channels == [54]
        ack(node, command)
    node.close()


def test_a_disconnect_drops_the_hold(client):
    node = online_node(client)
    assign(client, "amtk-nec-road")
    ack(node, next_command(node))
    with client.websocket_connect("/ws/live") as live:
        op(live, op="listen_hold", feed_id="node-1", aar_channel=CH)
        ack(node, next_command(node))
        assert client.app.state.rt.listening.channels("node-1") == {CH}
    command = next_command(node)
    assert command.channels == [54]
    assert client.app.state.rt.listening.channels("node-1") == set()
    ack(node, command)
    node.close()


def test_a_node_that_does_not_answer_fails_the_hold(client, monkeypatch):
    node = online_node(client)
    assign(client, "amtk-nec-road")
    ack(node, next_command(node))
    with client.websocket_connect("/ws/live") as live:
        op(live, op="listen_hold", feed_id="node-1", aar_channel=CH)
        node.send(wire.Ack(id=next_command(node).id, ok=False, error=wire.CommandError(code="failed", message="no")))
        failed = [t for t in states(live) if t["state"] == "failed"]
        assert failed and failed[0]["reason"] == "node failed"
    node.close()


def test_bad_holds_are_refused_or_ignored(client):
    node = online_node(client, preset="aar")
    with client.websocket_connect("/ws/live") as live:
        assert op(live, op="listen_hold", feed_id="feed-lnd", aar_channel=CH)[0]["reason"] == "not a node"
        assert op(live, op="listen_hold", feed_id="node-1", aar_channel=0) == []  # outside the band: ignored
        assert op(live, op="listen_hold", feed_id="node-1", aar_channel="54") == []
        assert op(live, op="listen_hold", aar_channel=54) == []
        (whole_band,) = op(live, op="listen_hold", feed_id="node-1", aar_channel=CH)
        assert whole_band["state"] == "listening"  # the aar preset decodes every channel already
    node.close()
    wait_for(lambda: node_status(client, client.get("/api/nodes").json()[0]["id"]) == "OFFLINE")
    with client.websocket_connect("/ws/live") as live:
        assert op(live, op="listen_hold", feed_id="node-1", aar_channel=CH)[0]["reason"] == "node offline"
