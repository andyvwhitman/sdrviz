"""The replay engine, driven tick by tick with a fake clock (no sockets, no real time)."""

import json
import shutil

import pytest

from app.audio.cache import job_for
from app.audio.synth import missing_tools
from app.config import Settings
from app.live import protocol
from app.runtime import Runtime
from app.sim.clock import SimClock
from app.sim.timefmt import parse_clock

from .test_clock import FakeMonotonic


@pytest.fixture
def rt(template_db, tmp_path) -> Runtime:
    db_path = tmp_path / "sdrviz.sqlite"
    shutil.copy(template_db, db_path)
    settings = Settings(db_path=db_path, audio_dir=tmp_path / "audio", prerender_audio=False)
    return Runtime(settings)


def run_ticks(rt: Runtime, start: str, seconds: float, speed: float = 1.0):
    """Step the engine every 100 ms of fake wall time; yields (type, payload) for every JSON message."""
    mono = FakeMonotonic()
    rt.clock = SimClock(parse_clock(start), speed, monotonic=mono)
    rt.engine.set_wall_clock(mono)
    rt.engine.resync(publish=False)
    client = rt.hub.register()
    for _ in range(int(seconds * 10)):
        mono.now += 0.1
        rt.engine.step()
        while not client.queue.empty():
            item = client.queue.get_nowait()
            if isinstance(item, str):
                payload = json.loads(item)
                yield payload["type"], payload


def messages_for(events, tx_id: str):
    return [(kind, p) for kind, p in events if p.get("tx_id") == tx_id]


def test_a_transmission_is_keyed_up_decoded_and_released_in_order(rt):
    # sim-0647: CH66, 14:07:21.0 for 11.2 s, decoded 1.6 s later
    events = list(run_ticks(rt, "14:07:19", 20))
    kinds = [kind for kind, _ in messages_for(events, "sim-0647")]
    assert kinds == ["keyup", "keydown", "words", "words"]
    keyup, keydown, draft, final = (p for _, p in messages_for(events, "sim-0647"))
    assert keyup["channel_id"] == "csx-be-disp" and keyup["aar"] == "CH66" and keyup["off_bank"] is True
    assert keyup["row"]["state"] == "decoding" and keyup["row"]["transcript"] == ""
    assert keyup["row"]["receptions"] == keyup["receptions"]  # the row lights the feeds at once
    assert keydown["duration_s"] == 11.2
    assert draft["state"] == "draft" and draft["confidence"] is None and draft["words"]
    assert final["state"] == "final" and final["confidence"] == 0.86


def test_each_second_sends_a_tick_and_train_positions(rt):
    events = list(run_ticks(rt, "14:07:00", 3.5))
    kinds = [kind for kind, _ in events]
    assert kinds.count("tick") == 4 and kinds.count("trains") == 4  # at 0.1 s, 1.1 s, 2.1 s, 3.1 s
    tick = next(p for kind, p in events if kind == "tick")
    assert tick["clock"].startswith("14:07:0") and tick["speed"] == 1.0


def test_levels_are_sent_only_while_something_is_keyed(rt):
    events = list(run_ticks(rt, "14:07:19", 4))
    levels = [p for kind, p in events if kind == "level"]
    assert levels and all("csx-be-disp" in p["levels"] or "amtk-nec-road" in p["levels"] for p in levels)
    quiet = {kind for kind, _ in run_ticks(rt, "03:40:00", 3)}
    assert "level" not in quiet and "keyup" not in quiet


def test_feed_and_fault_messages_follow_the_scripted_outage(rt):
    # BAY-04 goes stale at 14:05:10; LND-02 starts reconnecting at 14:05:00
    events = list(run_ticks(rt, "14:04:58", 20, speed=1.0))
    feed_events = [(p["feed_id"], p["state"]) for kind, p in events if kind == "feed"]
    assert ("feed-lnd", "offline") in feed_events and ("feed-bay", "stale") in feed_events
    faults = [p for kind, p in events if kind == "faults"]
    assert faults and faults[-1]["header"]["feeds_chip"] == "FEEDS 2/4"


def test_a_jump_resyncs_without_replaying_old_events(rt):
    events = list(run_ticks(rt, "14:07:30", 0.5))
    assert not [kind for kind, _ in events if kind in ("keyup", "keydown")]  # already keyed at 14:07:30


def test_audio_frames_are_paced_by_elapsed_time(rt, tmp_path):
    if missing_tools():
        pytest.skip("ffmpeg not installed")
    tx = next(t for t in rt.data.day.rows if t.id == "sim-0647")
    rt.audio.ensure(job_for(tx))

    mono = FakeMonotonic()
    rt.clock = SimClock(parse_clock("14:07:20"), 1.0, monotonic=mono)
    rt.engine.set_wall_clock(mono)
    rt.engine.resync(publish=False)
    client = rt.hub.register()
    client.audio = {"csx-be-disp"}
    frames = []
    for _ in range(150):
        mono.now += 0.1
        rt.engine.step()
        while not client.queue.empty():
            item = client.queue.get_nowait()
            if isinstance(item, bytes) and item[0] == protocol.KIND_AUDIO:
                frames.append(item)
    assert frames
    first, last = frames[0], frames[-1]
    assert first[1] == protocol.CODEC_PCM and first[2] == 66  # codec 0, CH66
    assert first[3] & protocol.FLAG_FIRST and last[3] & protocol.FLAG_LAST
    assert all(len(f) == 12 + protocol.CHUNK_BYTES for f in frames[:-1])
    offsets = [int.from_bytes(f[8:12], "big") for f in frames]
    assert offsets == sorted(offsets) and offsets[0] == 0
