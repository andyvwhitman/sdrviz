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
    channel = channel_ids(client)[0]
    pcm = b"\x00\x10" * 800  # 100 ms
    rt.recorder.add_pcm(channel, 7, 12, "live", pcm, first=True)
    rt.recorder.add_pcm(channel, 7, 12, "live", pcm + b"\x00\x10" * 10, first=False)  # 100 ms and a partial frame
    rt.recorder.end_pcm(channel)
    (row,) = rows(client)
    assert row.feed_id == "live" and row.duration_s == 0.22  # the partial frame is padded to 20 ms
    assert decoded_samples(settings.audio_path / row.audio_path)[0] == 48_000


def test_a_long_transmission_continues_in_a_second_file(client, settings):
    rt = client.app.state.rt
    rt.recorder.max_packets = 10
    channel = channel_ids(client)[0]
    recording = rt.recorder.begin(channel, 9, 12, "node-1")
    for packet in packets(25):
        rt.recorder.add(recording, packet)
    rt.recorder.finish(recording)
    names = [r.audio_path.rsplit("/", 1)[1] for r in rows(client)]
    assert names == [f"{channel}-9.ogg", f"{channel}-9-2.ogg", f"{channel}-9-3.ogg"]
    assert [r.duration_s for r in rows(client)] == [0.2, 0.2, 0.1]


def test_a_channel_in_no_bank_is_not_recorded(client):
    rt = client.app.state.rt
    assert rt.recorder.begin("no-such-channel", 1, 1, "node-1") is None
