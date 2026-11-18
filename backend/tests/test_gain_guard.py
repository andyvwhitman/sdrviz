"""A-2: the gain guard steps an overloaded node's gain down."""

from app.live import node_protocol as wire
from app.nodes.gain_guard import GainGuard, lower_gain

from .test_node_ws import enrolled_node, key_up, next_command, wait_for


def test_lower_gain_steps_one_r820t_gain_and_stops_at_the_floor():
    assert lower_gain(36.4) == 33.8
    assert lower_gain(28.0) == 25.4
    assert lower_gain(22.9) == 20.7
    assert lower_gain(20.7) is None  # the next step down, 19.7, is under the floor


def test_guard_steps_down_only_above_the_limit_and_once_a_minute():
    guard = GainGuard()
    assert guard.observe(-1.0, now=0) is None  # gain not known yet
    guard.gain_db = 36.4
    assert guard.observe(-6.0, now=1) is None
    assert guard.observe(-4.0, now=2) is None  # at the limit is fine
    assert guard.observe(-1.0, now=3) == 33.8
    guard.gain_db = 33.8
    assert guard.observe(-1.0, now=30) is None  # too soon
    assert guard.observe(-1.0, now=64) == 32.8
    guard.gain_db = None  # automatic gain: nothing to step
    assert guard.observe(-1.0, now=200) is None


def test_guard_reports_the_peak_of_the_last_minute():
    guard = GainGuard()
    assert guard.peak_dbfs(now=0) is None
    guard.observe(-20.0, now=1)
    guard.observe(-9.0, now=2)
    guard.observe(-15.0, now=3)
    assert guard.peak_dbfs(now=4) == -9.0
    assert guard.peak_dbfs(now=100) is None


def health(gain_db: float | None) -> wire.Health:
    return wire.Health(
        t=1, cpu_pct=10, temp_c=50, rtl_tcp="connected", dropped_blocks=0, audio_age_ms=100, uptime_s=1, channels=91,
        tune=wire.Tune(center_hz=160_890_000, rate=1_536_000, gain_db=gain_db, squelch_db=8),
    )  # fmt: skip


def test_overloaded_key_up_sends_a_gain_command_and_logs_an_event(client):
    node, node_id = enrolled_node(client)
    try:
        node.send(health(36.4))
        wait_for(lambda: client.get(f"/api/nodes/{node_id}").json()["health"] is not None)
        node.send(key_up(54).model_copy(update={"power_db": -1.5}))
        command = next_command(node)
        assert command.type == "gain" and command.gain_db == 33.8
        node.send(wire.Ack(id=command.id, ok=True))

        def gain_event():
            events = client.get(f"/api/nodes/{node_id}").json()["events"]
            return next((e for e in events if e["kind"] == "gain"), None)

        wait_for(lambda: gain_event() is not None)
        assert "36.4 -> 33.8" in gain_event()["detail"]
        detail = client.get(f"/api/nodes/{node_id}").json()
        assert detail["health"]["peak_dbfs"] == -1.5
    finally:
        node.close()
