"""A-3: the clock is Eastern whatever the server's zone, and live ages hold across midnight."""

from datetime import UTC, datetime

from app.sim import clock
from app.sim.timefmt import DAY, EASTERN, eastern_tz, parse_clock, seconds_since_midnight


def test_time_of_day_is_eastern_even_when_the_server_runs_utc(monkeypatch):
    utc = datetime(2026, 11, 18, 4, 9, 30, tzinfo=UTC)  # what a UTC container's clock shows
    monkeypatch.setattr(clock, "eastern_now", lambda: utc.astimezone(EASTERN))
    assert clock.local_time_of_day() == parse_clock("23:09:30")
    assert clock.WallClock().now() == parse_clock("23:09:30")


def test_tz_block_follows_daylight_saving():
    winter = datetime(2026, 11, 18, 12, 0, tzinfo=EASTERN)
    summer = datetime(2026, 7, 18, 12, 0, tzinfo=EASTERN)
    assert eastern_tz(winter) == {"name": "EST", "iana": "America/New_York", "utc_offset": "-05:00"}
    assert eastern_tz(summer) == {"name": "EDT", "iana": "America/New_York", "utc_offset": "-04:00"}
    assert seconds_since_midnight(summer) == 12 * 3600


def test_last_heard_is_filled_and_survives_midnight(client):
    rt = client.app.state.rt
    events = rt.radio.events
    channel = next(cid for cid, freq in rt.world.freqs.items() if freq.aar_channel == 54)
    rt.clock.jump(parse_clock("23:59:58"))
    assert events.key_up(channel, 1, 20.0, -40.0, "node-1")
    rt.clock.jump(parse_clock("00:00:05"))  # five seconds later, past midnight
    events.key_down(channel, "node-1")
    events.last_end[channel] = DAY + 2.0  # the transmission ended two seconds after midnight

    patch = events.channel_patch(channel)
    assert patch["last_heard"]["age_s"] == 3.0 and patch["last_heard"]["end_t"] == 2.0
    assert patch["state"] == "recent" and patch["status_readout"] == "LAST 3S"

    state = rt.live_state()
    shown = next(c for c in state["channels"] if c["id"] == channel)
    assert shown["last_heard"]["age_s"] == 3.0 and shown["state"] == "recent"
    assert state["views"][rt.active_bank.id]["hero"]["mode"] in ("idle", "keyed")


def test_snapshot_carries_a_transmission_on_air(client):
    rt = client.app.state.rt
    channel = next(cid for cid, freq in rt.world.freqs.items() if freq.aar_channel == 54)
    assert rt.radio.events.key_up(channel, 7, 20.0, -40.0, "node-1")
    state = rt.live_state()
    shown = next(c for c in state["channels"] if c["id"] == channel)
    assert shown["state"] == "tx" and shown["tx"]["primary_feed"] == "node-1"
    assert [row["frequency_id"] for row in state["active_transmissions"] if not row["sim"]] == [channel]
