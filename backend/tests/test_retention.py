"""D-3: audio is deleted past the age limit, then oldest first past the size cap; the rows stay."""

from datetime import timedelta

from sqlmodel import select

from app.db import open_session
from app.recordings.models import Recording
from app.recordings.recorder import utc_now
from app.recordings.retention import enforce

NOW = utc_now()


def store(client, settings, name, age_days, size=1000, state="ok") -> Recording:
    started = NOW - timedelta(days=age_days)
    path = settings.audio_path / f"{started:%Y/%m/%d}" / f"{name}.ogg"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x" * size)
    row = Recording(
        frequency_id="amtk-k-tower",
        aar_channel=12,
        feed_id="node-1",
        started_at=started,
        duration_s=1.0,
        audio_path=path.relative_to(settings.audio_path).as_posix(),
        audio_bytes=size,
        audio_state=state,
        transcript=f"words {name}",
        transcript_state="done",
        created_at=started,
    )
    with open_session(client.app.state.rt.db) as session:
        session.add(row)
        session.commit()
    return row


def states(client) -> dict[str, str]:
    with open_session(client.app.state.rt.db) as session:
        return {r.transcript.removeprefix("words "): r.audio_state for r in session.exec(select(Recording))}


def run(client, settings, days=90, max_bytes=10**9):
    return enforce(client.app.state.rt.db, settings.audio_path, days, max_bytes, NOW)


def test_audio_older_than_the_limit_goes_and_the_row_stays(client, settings):
    old = store(client, settings, "old", age_days=91)
    store(client, settings, "new", age_days=89)
    assert run(client, settings) == 1
    assert states(client) == {"old": "expired", "new": "ok"}
    assert not (settings.audio_path / old.audio_path).exists()
    assert not (settings.audio_path / old.audio_path).parent.exists()  # the emptied day folder goes too
    assert run(client, settings) == 0  # nothing more to do


def test_over_the_size_cap_the_oldest_audio_goes_first(client, settings):
    for name, age in (("a", 30), ("b", 20), ("c", 10), ("d", 1)):
        store(client, settings, name, age_days=age, size=1000)
    assert run(client, settings, max_bytes=2500) == 2  # 4000 B kept down to 2000 B
    assert states(client) == {"a": "expired", "b": "expired", "c": "ok", "d": "ok"}


def test_both_limits_together_and_expired_rows_do_not_count(client, settings):
    store(client, settings, "gone", age_days=5, size=100_000, state="expired")
    store(client, settings, "ancient", age_days=100)
    store(client, settings, "mid", age_days=10)
    store(client, settings, "new", age_days=1)
    run(client, settings, max_bytes=1500)
    assert states(client) == {"gone": "expired", "ancient": "expired", "mid": "expired", "new": "ok"}


def test_a_missing_file_is_not_an_error(client, settings):
    row = store(client, settings, "x", age_days=100)
    (settings.audio_path / row.audio_path).unlink()
    assert run(client, settings) == 1


def test_it_runs_at_start(settings):
    from fastapi.testclient import TestClient

    from app.main import create_app

    # a first app creates the database; the files and rows are added; a second start expires them
    with TestClient(create_app(settings)) as first:
        store(first, settings, "old", age_days=100)
    with TestClient(create_app(settings)) as second:
        from .test_node_ws import wait_for

        wait_for(lambda: states(second) == {"old": "expired"})
