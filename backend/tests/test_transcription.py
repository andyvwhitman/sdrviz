"""D-2: the transcription worker, with stub engines (no model is loaded in tests)."""

from datetime import timedelta

import pytest
from sqlmodel import select

from app.config import Settings
from app.db import open_session
from app.recordings.models import Recording
from app.recordings.recorder import utc_now
from app.recordings.transcription import (
    FasterWhisperTranscriber,
    Transcription,
    make_transcriber,
    vocabulary_prompt,
)

from .test_recorder import packets, rows


class Stub:
    name = "stub"

    def __init__(self, texts):
        self.texts = texts  # by file name; an Exception value is raised
        self.seen = []

    def transcribe(self, path):
        self.seen.append(path.name)
        result = self.texts[path.name.split("-")[-1]]
        if isinstance(result, Exception):
            raise result
        return result


def add(client, tx_seq, age_s=0):
    """Save a recording by the real recorder, started `age_s` ago."""
    rt = client.app.state.rt
    recording = rt.recorder.begin("amtk-k-tower", tx_seq, 12, rt.world.heard_by("amtk-k-tower")[0])
    recording.started_at = utc_now() - timedelta(seconds=age_s)
    for packet in packets(5):
        rt.recorder.add(recording, packet)
    rt.recorder.finish(recording)
    rt.recorder.flush()


def worker(client, texts) -> tuple[Transcription, Stub]:
    stub = Stub(texts)
    return Transcription(client.app.state.rt, stub), stub


def by_seq(client):
    return {r.audio_path.rsplit("-", 1)[1].removesuffix(".ogg"): r for r in rows(client)}


def test_without_an_engine_rows_are_saved_without_a_transcript(client):
    add(client, 1)
    assert [r.transcript_state for r in rows(client)] == ["empty"]
    assert not client.app.state.rt.transcription.enabled


def test_pending_rows_go_oldest_first_and_failures_do_not_stop_the_worker(client, monkeypatch):
    rt = client.app.state.rt
    monkeypatch.setattr(rt.transcription, "transcriber", Stub({}))  # enabled: new rows start pending
    add(client, 1, age_s=10)
    add(client, 2, age_s=30)  # the oldest, though saved later
    add(client, 3, age_s=20)
    add(client, 4, age_s=5)
    assert {r.transcript_state for r in rows(client)} == {"pending"}

    engine, stub = worker(client, {"1.ogg": "copy that", "2.ogg": RuntimeError("boom"), "3.ogg": "  ", "4.ogg": "over"})
    while engine.process_next():
        pass
    assert stub.seen == ["amtk-k-tower-2.ogg", "amtk-k-tower-3.ogg", "amtk-k-tower-1.ogg", "amtk-k-tower-4.ogg"]
    got = by_seq(client)
    assert [(got[k].transcript_state, got[k].transcript, got[k].engine) for k in "1234"] == [
        ("done", "copy that", "stub"),
        ("failed", "", "stub"),
        ("empty", "", "stub"),
        ("done", "over", "stub"),
    ]


def test_an_expired_recording_is_failed_not_transcribed(client, monkeypatch):
    rt = client.app.state.rt
    monkeypatch.setattr(rt.transcription, "transcriber", Stub({}))
    add(client, 1)
    with open_session(rt.db) as session:
        row = session.exec(select(Recording)).one()
        row.audio_state = "expired"
        session.add(row)
        session.commit()
    engine, stub = worker(client, {})
    assert engine.process_next() and stub.seen == [] and rows(client)[0].transcript_state == "failed"
    assert not engine.process_next()


def test_the_thread_transcribes_a_new_recording_when_woken(client, monkeypatch):
    rt = client.app.state.rt
    engine, _ = worker(client, {"1.ogg": "clear signal"})
    monkeypatch.setattr(rt, "transcription", engine)
    engine.start()
    try:
        add(client, 1)
        from .test_node_ws import wait_for

        wait_for(lambda: rows(client)[0].transcript_state == "done")
    finally:
        engine.stop()
    assert rows(client)[0].transcript == "clear signal"


def test_engine_setting():
    assert make_transcriber(Settings(transcriber="none"), lambda: "") is None
    engine = make_transcriber(Settings(transcriber="faster-whisper"), lambda: "")
    assert isinstance(engine, FasterWhisperTranscriber) and engine.name == "faster-whisper:small.en"
    assert engine._model is None  # nothing is loaded until the first clip
    with pytest.raises(ValueError):
        make_transcriber(Settings(transcriber="whisper-large"), lambda: "")


def test_the_prompt_has_the_app_vocabulary_and_the_jargon(client):
    prompt = vocabulary_prompt(client.app.state.rt)
    freqs = client.get("/api/frequencies").json()
    assert freqs[0]["label"] in prompt
    assert "Washington Union Station" in prompt
    assert "foul time" in prompt and "milepost" in prompt and len(prompt) < 900


def test_decode_audio_gives_16k_mono_floats(tmp_path):
    from app.recordings.ogg import ogg_opus
    from app.recordings.transcription import WHISPER_RATE, decode_audio

    path = tmp_path / "x.ogg"
    path.write_bytes(ogg_opus(packets(50)))  # 1 s
    samples = decode_audio(path)
    assert samples.dtype.name == "float32" and samples.ndim == 1
    assert abs(len(samples) - WHISPER_RATE) < 400
