"""D-1: a transmission becomes one playable Ogg Opus file and one recording row."""

import av
from sqlmodel import select

from app.db import open_session
from app.live.opus import OpusEncoder
from app.recordings.models import Recording
from app.recordings.ogg import ogg_opus

from .test_ghosts import CH12, CH14, channel_ids, key, run_node
from .test_node_ws import wait_for


def rows(client) -> list[Recording]:
    rt = client.app.state.rt
    rt.recorder.flush()
    with open_session(rt.db) as session:
        return list(session.exec(select(Recording).order_by(Recording.id)))


def packets(count: int) -> list[bytes]:
    encoder = OpusEncoder()
    return [encoder.encode(b"\x00\x10" * 160) for _ in range(count)]


def decoded_samples(path) -> tuple[int, int]:
    """(sample rate, samples) of an audio file, decoded by libav."""
    with av.open(str(path)) as container:
        stream = container.streams.audio[0]
        total = sum(frame.samples for frame in container.decode(stream))
        return stream.codec_context.sample_rate, total


def test_ogg_opus_file_decodes_with_the_packets_unchanged(tmp_path):
    sent = packets(120)  # 2.4 s: three pages
    path = tmp_path / "x.ogg"
    path.write_bytes(ogg_opus(sent))
    with av.open(str(path)) as container:
        assert container.format.name == "ogg"
        assert [bytes(p) for p in container.demux(container.streams.audio[0]) if p.size] == sent
    rate, samples = decoded_samples(path)
    assert rate == 48_000 and abs(samples - 2.4 * 48_000) < 960


def test_a_node_transmission_is_saved_with_its_row(client, settings):
    texts, _ = run_node(client, [key(14, CH14, -36.0, 2)], audio_for=14)  # the held weak call that survives
    wait_for(lambda: rows(client))
    (row,) = rows(client)
    freq14 = channel_ids(client)[1]
    assert (row.frequency_id, row.aar_channel, row.feed_id) == (freq14, 14, "node-1")
    assert row.duration_s == 0.2 and row.audio_state == "ok" and row.transcript_state == "empty"  # engine "none"
    assert row.audio_path.endswith(".ogg") and row.audio_path.startswith(f"{row.started_at:%Y/%m/%d}/{freq14}-")
    assert row.feed_lat is not None and row.feed_lon is not None
    path = settings.audio_path / row.audio_path
    assert path.stat().st_size == row.audio_bytes
    assert abs(decoded_samples(path)[1] - 0.2 * 48_000) < 960


def test_a_ghost_is_not_recorded(client):
    run_node(client, [key(12, CH12, -9.0, 1), key(14, CH14, -36.0, 2)], audio_for=14)
    assert rows(client) == []


def test_lan_pcm_is_encoded_and_saved(client, settings):
    rt = client.app.state.rt
    channel = rt.world.feeds["feed-lnd"].hears[0]
    pcm = b"\x00\x10" * 800  # 100 ms
    rt.recorder.add_pcm(channel, 7, 12, "feed-lnd", pcm, first=True)
    rt.recorder.add_pcm(channel, 7, 12, "feed-lnd", pcm + b"\x00\x10" * 10, first=False)  # 100 ms and a partial frame
    rt.recorder.end_pcm(channel)
    (row,) = rows(client)
    assert row.feed_id == "feed-lnd" and row.duration_s == 0.22  # the partial frame is padded to 20 ms
    assert decoded_samples(settings.audio_path / row.audio_path)[0] == 48_000


def test_a_long_transmission_continues_in_a_second_file(client, settings):
    rt = client.app.state.rt
    rt.recorder.max_packets = 10
    channel = rt.world.feeds["feed-lnd"].hears[0]
    recording = rt.recorder.begin(channel, 9, 12, "feed-lnd")
    for packet in packets(25):
        rt.recorder.add(recording, packet)
    rt.recorder.finish(recording)
    names = [r.audio_path.rsplit("/", 1)[1] for r in rows(client)]
    assert names == [f"{channel}-9.ogg", f"{channel}-9-2.ogg", f"{channel}-9-3.ogg"]
    assert [r.duration_s for r in rows(client)] == [0.2, 0.2, 0.1]


def test_a_recording_needs_the_frequency_enabled_on_the_feed(client):
    rt = client.app.state.rt
    freq = "amtk-nec-road"
    assert rt.recorder.begin(freq, 1, 54, "feed-lnd") is not None  # enabled there
    assert rt.recorder.begin(freq, 1, 54, "node-9") is None  # that feed does not hear it
    client.put(f"/api/frequencies/{freq}/assignments/feed-lnd", json={"enabled": False})
    assert rt.recorder.begin(freq, 1, 54, "feed-lnd") is None  # disabled
    assert rt.recorder.begin("no-such-channel", 1, 1, "feed-lnd") is None


def test_a_recording_carries_the_node_and_its_position(client):
    texts, _ = run_node(client, [key(14, CH14, -36.0, 2)], audio_for=14)
    wait_for(lambda: rows(client))
    (row,) = rows(client)
    node_id = client.get("/api/nodes").json()[0]["id"]
    assert row.node_id == node_id and (row.feed_lat, row.feed_lon) == (38.9, -77.0)
    assert client.get("/api/recordings").json()[0]["node_id"] == node_id


def test_older_recordings_get_their_node_id_at_startup(client):
    from sqlalchemy import text

    from app.db import create_schema

    node_id = client.post("/api/nodes", json={"name": "A", "location": {"lat": 1, "lon": 2}}).json()["node"]["id"]
    rt = client.app.state.rt
    with rt.db.begin() as conn:
        conn.execute(text("DROP INDEX IF EXISTS ix_recording_node_id"))
        conn.execute(text("ALTER TABLE recording DROP COLUMN node_id"))
        conn.execute(
            text(
                "INSERT INTO recording (frequency_id, aar_channel, feed_id, started_at, duration_s, audio_path, "
                "audio_bytes, audio_state, transcript, transcript_state, engine, created_at) VALUES "
                "('f', 1, :feed, '2026-11-01', 1, 'x', 1, 'ok', '', 'done', '', '2026-11-01')"
            ),
            {"feed": "node-1"},
        )
    create_schema(rt.db)
    assert rows(client)[0].node_id == node_id
