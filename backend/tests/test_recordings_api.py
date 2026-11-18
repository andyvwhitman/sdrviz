"""D-4: recordings list, audio with ranges, activity buckets; viewer-readable and behind login."""

from datetime import UTC, datetime

import pytest

from app.db import open_session
from app.recordings.models import Recording
from app.recordings.ogg import ogg_opus

from .test_recorder import packets

FREQ = "amtk-k-tower"
OTHER = "amtk-wash-term"


def utc(*args) -> datetime:
    return datetime(*args, tzinfo=UTC)


def add(client, settings, started, freq=FREQ, duration=10.0, state="ok", transcript="", tstate="done") -> int:
    path = settings.audio_path / f"{started:%Y/%m/%d}" / f"{freq}-{started:%H%M%S}.ogg"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(ogg_opus(packets(25)))
    row = Recording(
        frequency_id=freq,
        aar_channel=12,
        feed_id="node-1",
        feed_lat=38.9,
        feed_lon=-77.0,
        started_at=started,
        duration_s=duration,
        audio_path=path.relative_to(settings.audio_path).as_posix(),
        audio_bytes=path.stat().st_size,
        audio_state=state,
        transcript=transcript,
        transcript_state=tstate,
        engine="stub",
        created_at=started,
    )
    with open_session(client.app.state.rt.db) as session:
        session.add(row)
        session.commit()
        return row.id


def test_everything_is_behind_login(anonymous):
    for path in (
        "/api/recordings",
        "/api/recordings/1/audio",
        f"/api/frequencies/{FREQ}/activity",
        "/api/frequencies/activity",
    ):
        assert anonymous.get(path).status_code == 401, path  # fmt: skip


def test_list_is_newest_first_with_paging_and_a_frequency_filter(client, settings):
    ids = [add(client, settings, utc(2026, 11, 16, 12, minute), transcript=f"t{minute}") for minute in range(5)]
    add(client, settings, utc(2026, 11, 16, 12, 30), freq=OTHER)
    page = client.get("/api/recordings", params={"frequency_id": FREQ, "limit": 2}).json()
    assert [r["id"] for r in page] == [ids[4], ids[3]]
    older = client.get("/api/recordings", params={"frequency_id": FREQ, "before": page[-1]["started_at"]}).json()
    assert [r["id"] for r in older] == [ids[2], ids[1], ids[0]]
    assert [r["frequency_id"] for r in client.get("/api/recordings").json()][0] == OTHER
    assert client.get("/api/recordings", params={"limit": 0}).status_code == 422
    row = page[0]
    assert row["started_at"] == "2026-11-16T12:04:00.000Z" and row["audio_url"] == f"/api/recordings/{ids[4]}/audio"
    assert row["transcript"] == "t4" and row["feed_lat"] == 38.9 and row["audio_state"] == "ok"
    assert client.get(f"/api/recordings/{ids[0]}").json()["id"] == ids[0]
    assert client.get("/api/recordings/9999").status_code == 404


def test_audio_is_ogg_and_answers_ranges(client, settings):
    rid = add(client, settings, utc(2026, 11, 16, 12, 0))
    full = client.get(f"/api/recordings/{rid}/audio")
    assert full.status_code == 200 and full.headers["content-type"] == "audio/ogg"
    assert full.headers["accept-ranges"] == "bytes" and full.content[:4] == b"OggS"
    part = client.get(f"/api/recordings/{rid}/audio", headers={"Range": "bytes=10-49"})
    assert part.status_code == 206 and part.content == full.content[10:50]
    assert part.headers["content-range"] == f"bytes 10-49/{len(full.content)}"


def test_expired_and_missing_audio(client, settings):
    gone = add(client, settings, utc(2026, 11, 16, 12, 0), state="expired")
    lost = add(client, settings, utc(2026, 11, 16, 12, 1))
    for path in settings.audio_path.rglob("*.ogg"):
        if "120100" in path.name:
            path.unlink()
    assert client.get(f"/api/recordings/{gone}/audio").status_code == 410
    assert client.get(f"/api/recordings/{lost}/audio").status_code == 404
    assert client.get(f"/api/recordings/{gone}").json()["audio_url"] is None


def test_day_activity_uses_eastern_days_and_15_minute_buckets(client, settings):
    # 2026-11-16 in New York (EST, UTC-5) runs from 05:00 UTC to 05:00 UTC next day
    add(client, settings, utc(2026, 11, 16, 4, 59), duration=99)  # the evening before: not in the day
    add(client, settings, utc(2026, 11, 16, 5, 0), duration=4)  # 00:00 local: bucket 0
    add(client, settings, utc(2026, 11, 16, 5, 14, 59), duration=6.5)  # bucket 0
    add(client, settings, utc(2026, 11, 16, 19, 20), duration=12)  # 14:20 local: bucket 57
    add(client, settings, utc(2026, 11, 16, 19, 25), freq=OTHER, duration=50)  # another frequency
    body = client.get(f"/api/frequencies/{FREQ}/activity", params={"date": "2026-11-16"}).json()
    assert (body["frequency_id"], body["date"], body["tz"]) == (FREQ, "2026-11-16", "America/New_York")
    assert body["recording_since"] == "2026-11-16T04:59:00.000Z"
    buckets = body["buckets"]
    assert len(buckets) == 96 and buckets[0] == {"start": "2026-11-16T05:00:00.000Z", "count": 2, "airtime_s": 10.5}
    assert buckets[57] == {"start": "2026-11-16T19:15:00.000Z", "count": 1, "airtime_s": 12.0}
    assert sum(b["count"] for b in buckets) == 3


def test_no_recordings_yet_is_null_not_zero(client):
    body = client.get(f"/api/frequencies/{FREQ}/activity").json()  # today by default
    assert (
        body["recording_since"] is None and len(body["buckets"]) == 96 and not any(b["count"] for b in body["buckets"])
    )
    assert (
        body["date"]
        == datetime.now(UTC).astimezone(__import__("zoneinfo").ZoneInfo("America/New_York")).date().isoformat()
    )


@pytest.mark.parametrize(("day", "count"), [("2026-03-08", 92), ("2026-11-01", 100), ("2026-06-01", 96)])
def test_daylight_saving_days_have_92_or_100_buckets(client, day, count):
    assert len(client.get(f"/api/frequencies/{FREQ}/activity", params={"date": day}).json()["buckets"]) == count


def test_week_is_seven_days_of_24_hours_oldest_first(client, settings):
    add(client, settings, utc(2026, 11, 10, 5, 30), duration=3)  # 00:30 local on the 10th: the first day, hour 0
    add(client, settings, utc(2026, 11, 16, 19, 20), duration=12)  # 14:20 local on the 16th: the last day, hour 14
    add(client, settings, utc(2026, 11, 9, 20, 0))  # the 9th: outside
    body = client.get(f"/api/frequencies/{FREQ}/activity/week", params={"date": "2026-11-16"}).json()
    assert [d["date"] for d in body["days"]] == [f"2026-11-{n}" for n in range(10, 17)]
    assert all(len(d["hours"]) == 24 for d in body["days"])
    assert body["days"][0]["hours"][0] == {"start": "2026-11-10T05:00:00.000Z", "count": 1, "airtime_s": 3.0}
    assert body["days"][6]["hours"][14] == {"start": "2026-11-16T19:00:00.000Z", "count": 1, "airtime_s": 12.0}
    assert sum(h["count"] for d in body["days"] for h in d["hours"]) == 2
    assert body["recording_since"] == "2026-11-09T20:00:00.000Z"


def test_batch_activity_covers_every_banked_frequency(client, settings):
    add(client, settings, utc(2026, 11, 16, 19, 20), duration=12)
    add(client, settings, utc(2026, 11, 1, 19, 20), freq=OTHER)  # an earlier day: only recording_since shows it
    body = client.get("/api/frequencies/activity", params={"date": "2026-11-16"}).json()
    banked = {f for f in client.app.state.rt.world.freqs if client.app.state.rt.world.banks_of(f)}
    assert {f["frequency_id"] for f in body["frequencies"]} == banked
    by_id = {f["frequency_id"]: f for f in body["frequencies"]}
    assert by_id[FREQ]["buckets"][57]["count"] == 1 and by_id[FREQ]["recording_since"] == "2026-11-16T19:20:00.000Z"
    assert (
        not any(b["count"] for b in by_id[OTHER]["buckets"])
        and by_id[OTHER]["recording_since"] == "2026-11-01T19:20:00.000Z"
    )
    assert len(by_id[FREQ]["buckets"]) == 96


def test_unknown_frequency_and_bad_date(client):
    assert client.get("/api/frequencies/nope/activity").status_code == 404
    assert client.get("/api/frequencies/nope/activity/week").status_code == 404
    assert client.get(f"/api/frequencies/{FREQ}/activity", params={"date": "yesterday"}).status_code == 422
    assert client.get(f"/api/frequencies/{FREQ}").status_code == 200  # the plain frequency route still works


def test_a_viewer_can_read_recordings(settings):
    from fastapi.testclient import TestClient

    from app.main import create_app

    settings = settings.model_copy(update={"admin_password": "admin-password"})
    with TestClient(create_app(settings)) as viewer:
        assert viewer.post("/api/auth/login", json={"password": settings.password}).status_code == 204
        assert viewer.get("/api/recordings").status_code == 200
        assert viewer.get(f"/api/frequencies/{FREQ}/activity/week").status_code == 200
        assert viewer.get("/api/frequencies/activity").status_code == 200
