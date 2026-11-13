import pytest

from app.audio.synth import missing_tools

URL = "/api/transmissions"


def ids(response) -> list[str]:
    return [item["id"] for item in response.json()["items"]]


def test_default_page_is_newest_first_and_excludes_kerchunks(client):
    body = client.get(URL).json()
    assert body["total"] == 1265 and len(body["items"]) == 100 and body["next_cursor"]
    times = [i["t_offset_s"] for i in body["items"]]
    assert times == sorted(times, reverse=True)
    assert client.get(f"{URL}/kc-001").status_code == 200  # kerchunks are fetchable by id...
    assert not any(i.startswith("kc-") for i in ids(client.get(f"{URL}?limit=500")))  # ...but not listed


def test_cursor_paging_walks_every_row_once(client):
    seen, cursor = [], None
    while True:
        query = f"{URL}?limit=500" + (f"&cursor={cursor}" if cursor else "")
        body = client.get(query).json()
        seen += [i["id"] for i in body["items"]]
        cursor = body["next_cursor"]
        if not cursor:
            break
    assert len(seen) == len(set(seen)) == 1265


def test_ascending_order(client):
    items = client.get(f"{URL}?order=asc&limit=3").json()["items"]
    assert [i["id"] for i in items][0] == "tx-001" and items[0]["clock"] == "00:12:40"


def test_row_shape(client):
    row = client.get(f"{URL}/sim-0456").json()
    assert row["started_at"] == "2026-11-10T08:43:00.300-05:00" and row["clock"] == "08:43:00"
    assert row["speaker_role"] == "crew" and row["train_id"] == "MARC 418" and row["words"] and row["receptions"]
    assert client.get(f"{URL}/nope").status_code == 404


def test_scalar_filters(client):
    assert set(ids(client.get(f"{URL}?train_id=MARC 418&limit=500"))) >= {"sim-0456"}
    rows = client.get(f"{URL}?frequency_id=amtk-nec-road&role=dispatcher&limit=500").json()["items"]
    assert rows and all(r["frequency_id"] == "amtk-nec-road" and r["speaker_role"] == "dispatcher" for r in rows)
    assert all(r["aar_channel"] == 54 for r in client.get(f"{URL}?aar=54&limit=500").json()["items"])
    assert client.get(f"{URL}?aar=54&min_duration=8&limit=500").json()["items"]
    states = {r["transcript_state"] for r in client.get(f"{URL}?state=carrier_only&limit=500").json()["items"]}
    assert states == {"carrier_only"}


def test_feed_and_bank_filters(client):
    assert all(
        any(rec["feed_id"] == "feed-bay" for rec in r["receptions"])
        for r in client.get(f"{URL}?feed_id=feed-bay&limit=500").json()["items"]
    )
    harbor = client.get("/api/banks/bank-harbor").json()["frequency_ids"]
    rows = client.get(f"{URL}?bank_id=bank-harbor&limit=500").json()["items"]
    assert rows and all(r["frequency_id"] in harbor for r in rows)


def test_defect_filter_finds_the_one_defect_report(client):
    rows = client.get(f"{URL}?defect=true").json()["items"]
    assert [r["id"] for r in rows] == ["tx-064"] and rows[0]["detector"]["defect"] is True


def test_keyword_search_uses_prefix_matching(client):
    rows = client.get(f"{URL}?q=odenton&limit=500").json()["items"]
    assert rows and all("odenton" in r["transcript"].lower() for r in rows)
    prefix = client.get(f"{URL}?q=odent").json()["total"]
    assert prefix == len(rows)
    train = client.get(f"{URL}?q=marc 418").json()
    assert train["total"] and all("418" in (r["train_id"] or "") + r["transcript"] for r in train["items"])
    assert client.get(f"{URL}?q=zzzzqq").json()["total"] == 0
    assert client.get(f'{URL}?q="; DROP TABLE x').status_code == 200  # punctuation is not query syntax


def test_time_window(client):
    window = "start=2026-11-10T14:06:00-05:00&end=2026-11-10T14:08:00-05:00"
    rows = client.get(f"{URL}?{window}&order=asc").json()["items"]
    assert rows and all("14:06:00" <= r["clock"] < "14:08:00" for r in rows)
    assert client.get(f"{URL}?start=garbage").status_code == 422


def test_window_wraps_to_the_previous_evening(client):
    # 24 h ending 01:00: the evening rows appear shifted into 2026-11-09, the early rows stay on the 10th
    window = "start=2026-11-09T01:00:00-05:00&end=2026-11-10T01:00:00-05:00"
    body = client.get(f"{URL}?{window}&order=asc&limit=1").json()
    assert body["total"] == 1265  # a 24 h window holds the whole repeating day exactly once
    assert body["items"][0]["started_at"].startswith("2026-11-09T01:15:30")
    newest = client.get(f"{URL}?{window}&order=desc&limit=1").json()["items"][0]
    assert newest["started_at"].startswith("2026-11-10T00:") and newest["t_offset_s"] > 0


def test_summary_of_the_last_hour(client):
    body = client.get(f"{URL}/summary").json()
    assert body["range"] == {"start_t": 47250.0, "end_t": 50850.0, "start": "13:07", "end": "14:07"}
    assert body["hero"].startswith("13:07–14:07 EST ·") and body["hero"].endswith("AIRTIME")
    assert body["totals"]["count"] > 0 and len(body["scrubber_airtime_per_min"]) == 1440
    assert sum(body["scrubber_airtime_per_min"]) > 0


def test_summary_honours_filters(client):
    everything = client.get(f"{URL}/summary").json()["totals"]["count"]
    nec = client.get(f"{URL}/summary?frequency_id=amtk-nec-road").json()["totals"]["count"]
    assert 0 < nec < everything


@pytest.mark.skipif(bool(missing_tools()), reason="ffmpeg is not installed")
class TestAudio:
    def test_clip_is_rendered_on_first_request_and_cached(self, client, settings):
        first = client.get(f"{URL}/sim-0456/audio")
        assert first.status_code == 200 and first.headers["content-type"].startswith("audio/webm")
        assert first.content[:4] == b"\x1a\x45\xdf\xa3"  # EBML header of a WebM container
        assert (settings.audio_path / "sim-0456.webm").exists() and (settings.audio_path / "sim-0456.pcm").exists()
        assert client.get(f"{URL}/sim-0456/audio").content == first.content

    def test_range_requests(self, client):
        full = client.get(f"{URL}/sim-0456/audio").content
        part = client.get(f"{URL}/sim-0456/audio", headers={"Range": "bytes=0-99"})
        assert part.status_code == 206 and part.content == full[:100]
        assert part.headers["content-range"].startswith("bytes 0-99/")

    def test_waveform(self, client):
        body = client.get(f"{URL}/sim-0456/waveform?bins=50").json()
        assert body["duration_s"] == 2.9 and len(body["peaks"]) == 50
        assert max(body["peaks"]) == 1.0 and all(0 <= p <= 1 for p in body["peaks"])

    def test_a_kerchunk_is_a_short_burst(self, client):
        assert client.get(f"{URL}/kc-001/audio").status_code == 200
