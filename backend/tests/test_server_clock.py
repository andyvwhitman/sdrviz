"""The server is the one clock: key-up timers on the clients count against its `tick` and the `now` of a key-up."""

import json

from fastapi.testclient import TestClient

from app.live import node_protocol as wire
from app.main import create_app
from tests.test_ws import is_type, receive_until


def channel_54(rt) -> str:
    return next(cid for cid, freq in rt.world.freqs.items() if freq.aar_channel == 54)


def test_a_server_without_the_replay_still_ticks(settings):
    """Root cause of the 1436:xx.x timer: with SDRVIZ_SIM=false nothing sent `tick`, so a client whose own timer
    had stopped (a sleeping laptop, a locked phone) never re-anchored and read a new key-up as 4 minutes ahead."""
    settings.sim = False
    with TestClient(create_app(settings)) as app:
        app.post("/api/auth/login", json={"password": "test-password"})
        with app.websocket_connect("/ws/live") as ws:
            tick = receive_until(ws, is_type("tick"))
        rt = app.app.state.rt
        assert rt._ticker is not None and not rt.engine._task
        assert tick["t"] <= rt.clock.now() and tick["clock"] and tick["speed"] == rt.clock.speed


def test_the_replay_sends_the_ticks_when_it_runs(client):
    assert client.app.state.rt._ticker is None  # one ticker, not two


def test_a_key_up_carries_the_server_clock_it_was_stamped_with(client):
    rt = client.app.state.rt
    sent: list[str] = []
    rt.hub.broadcast = sent.append  # the hub posts to the event loop from a test thread
    rt.clock.jump(50_000.0)
    assert rt.radio.events.key_up(channel_54(rt), 1, 20.0, -40.0, "node-1")
    keyup = json.loads(sent[0])
    assert keyup["type"] == "keyup" and keyup["t"] == keyup["now"] == 50_000.0
    assert keyup["row"]["t_offset_s"] == 50_000.0


def test_a_node_key_up_is_stamped_by_the_server_not_by_the_node(client):
    """The node's own `t` (its epoch milliseconds) is never read: the stamp is the server clock at arrival."""
    assert "t" in wire.KeyUp.model_fields  # the node sends it...
    rt = client.app.state.rt
    sent: list[str] = []
    rt.hub.broadcast = sent.append  # the hub posts to the event loop from a test thread
    assert rt.radio.events.key_up(channel_54(rt), 2, 20.0, -40.0, "node-1")  # ...and key_up() has no time argument
    keyup = json.loads(sent[0])
    assert keyup["t"] == rt.clock.now()
