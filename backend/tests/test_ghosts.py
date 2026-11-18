"""A-5: a weak key-up that starts with a much stronger neighbour is a ghost and is dropped."""

import json
import time

from app.live import node_protocol as wire
from app.live import protocol
from app.live.opus import OpusEncoder
from app.nodes.ghosts import GhostFilter

from .test_node_ws import audio, channel_id, enrolled_node, read_live, subscribe

CH12, CH14, CH30 = 160_290_000, 160_320_000, 160_500_000


def judge(filter_: GhostFilter, ch, freq, power, now):
    return filter_.is_ghost(filter_.note(ch, freq, power, now))


def test_weak_neighbour_keying_with_a_strong_one_is_a_ghost_either_order():
    f = GhostFilter()
    strong = f.note(12, CH12, -9.0, now=10.0)
    weak = f.note(14, CH14, -36.0, now=10.02)
    assert f.is_ghost(weak) and not f.is_ghost(strong)
    assert f.counts == {14: 1}

    g = GhostFilter()  # the weak one first, the strong one 0.1 s later
    weak = g.note(14, CH14, -36.0, now=20.0)
    g.note(12, CH12, -9.0, now=20.1)
    assert g.is_ghost(weak)


def test_not_a_ghost_when_far_in_time_in_frequency_or_in_level():
    f = GhostFilter()
    f.note(12, CH12, -9.0, now=0.0)
    assert not judge(f, 14, CH14, -36.0, now=0.7)  # keyed 0.7 s after: a real call
    assert not judge(f, 30, CH30, -36.0, now=0.1)  # 210 kHz away
    assert not judge(f, 14, CH14, -25.0, now=0.1)  # only 16 dB down
    assert not f.counts


def test_a_ghost_sees_only_other_channels():
    f = GhostFilter()
    first = f.note(12, CH12, -40.0, now=0.0)
    again = f.note(12, CH12, -70.0, now=0.1)  # same channel keying twice is not a neighbour
    assert not f.is_ghost(first) and not f.is_ghost(again)


def channel_ids(client):
    return channel_id(client, 12), channel_id(client, 14)


def key(ch, freq, power, seq):
    return wire.KeyUp(ch=ch, freq_hz=freq, tx_seq=seq, t=1, snr_db=20, power_db=power)


def run_node(client, to_send: list, audio_for: int | None = None) -> tuple[list[dict], list[bytes]]:
    """Send `to_send` through an enrolled node (and audio packets on `audio_for`); return what /ws/live got."""
    node, _ = enrolled_node(client)
    ch12, ch14 = channel_ids(client)
    try:
        with client.websocket_connect("/ws/live") as live:
            subscribe(live, [ch12, ch14], "node-1")
            for message in to_send:
                node.send(message)
            encoder = OpusEncoder()
            for index in range(10 if audio_for else 0):  # 200 ms: two chunks of PCM when forwarded
                packet = encoder.encode(b"\x00\x10" * 160)
                node.ws.send_bytes(audio(audio_for, index, seq=2, packet=packet))
            time.sleep(0.8)  # past the hold
            node.send(wire.KeyDown(ch=12, tx_seq=1, t=3))
            node.send(wire.KeyDown(ch=14, tx_seq=2, t=3))
            live.send_text(json.dumps({"op": "ping"}))
            texts, frames = read_live(live, lambda texts, _: any(t["type"] == "pong" for t in texts))
            return texts, [f for f in frames if f[0] == protocol.KIND_AUDIO]  # not the replay's spectrum rows
    finally:
        node.close()


def keyups(texts) -> list[str]:
    return [t["channel_id"] for t in texts if t["type"] == "keyup"]


def test_simultaneous_keyups_27_db_apart_give_one_event(client):
    texts, _ = run_node(client, [key(12, CH12, -9.0, 1), key(14, CH14, -36.0, 2)])
    assert keyups(texts) == [channel_ids(client)[0]]


def test_the_weak_one_first_is_held_and_dropped_too(client):
    texts, _ = run_node(client, [key(14, CH14, -36.0, 2), key(12, CH12, -9.0, 1)])
    assert keyups(texts) == [channel_ids(client)[0]]


def test_a_real_weak_call_alone_still_comes_through_after_the_hold(client):
    texts, _ = run_node(client, [key(14, CH14, -36.0, 2)])
    assert keyups(texts) == [channel_ids(client)[1]]


def test_ghost_audio_is_not_forwarded(client):
    _, frames = run_node(client, [key(12, CH12, -9.0, 1), key(14, CH14, -36.0, 2)], audio_for=14)
    assert frames == []


def test_held_audio_of_a_real_call_is_forwarded_after_the_hold(client):
    _, frames = run_node(client, [key(14, CH14, -36.0, 2)], audio_for=14)
    assert frames  # the packets that arrived during the hold are decoded and sent
