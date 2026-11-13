"""REST endpoints. The sim clock is frozen at 14:07:30 (the `keyed` moment) unless a test jumps it."""

from .conftest import PASSWORD


class TestAuth:
    def test_everything_but_login_and_session_needs_a_cookie(self, anonymous):
        for path in ("/api/system", "/api/live/state", "/api/prefs", "/api/frequencies", "/api/transmissions"):
            assert anonymous.get(path).status_code == 401
        assert anonymous.get("/api/auth/session").json() == {"authenticated": False, "sim": True}

    def test_login_sets_a_cookie_and_logout_clears_it(self, anonymous):
        assert anonymous.post("/api/auth/login", json={"password": "nope"}).status_code == 401
        response = anonymous.post("/api/auth/login", json={"password": PASSWORD})
        assert response.status_code == 204
        cookie = response.headers["set-cookie"].lower()
        assert "sdrviz_session" in cookie and "httponly" in cookie and "samesite=lax" in cookie
        assert anonymous.get("/api/auth/session").json()["authenticated"] is True
        assert anonymous.get("/api/system").status_code == 200
        assert anonymous.post("/api/auth/logout").status_code == 204
        assert anonymous.get("/api/system").status_code == 401

    def test_login_is_rate_limited(self, anonymous):
        codes = [anonymous.post("/api/auth/login", json={"password": "x"}).status_code for _ in range(7)]
        assert codes == [401] * 5 + [429] * 2


class TestLiveState:
    def test_live_state_is_the_keyed_moment(self, client):
        state = client.get("/api/live/state").json()
        assert state["clock"] == "14:07:30" and state["active_bank"] == "bank-nec"
        assert {
            "header",
            "feeds",
            "channels",
            "views",
            "active_transmissions",
            "transcript",
            "trains",
            "ctc",
            "lofar_60m",
        } <= set(state)
        assert len(state["channels"]) == 31 and len(state["feeds"]) == 4
        assert sorted(t["aar"] for t in state["active_transmissions"]) == ["CH08", "CH54", "CH66"]
        assert len(state["channels"][0]["spark_60m"]) == 60

    def test_system(self, client):
        body = client.get("/api/system").json()
        assert set(body) >= {"host", "decoder", "disk", "version", "sim"} and body["decoder"]["state"] == "ok"


class TestSim:
    def test_jump_to_a_scenario_sets_clock_bank_and_state(self, client):
        response = client.post("/api/sim/jump", json={"scenario": "fault", "speed": 0})
        assert response.json() == {"scenario": "fault", "clock": "14:06:22", "speed": 0.0}
        assert client.get("/api/prefs").json()["active_bank"] == "bank-commuter"
        state = client.get("/api/live/state").json()
        assert state["header"]["feeds_chip"] == "FEEDS 2/4" and state["scenario"] == "fault"
        assert [f["object"] for f in state["faults"]] == ["feed-lnd"]

    def test_jump_to_a_clock_time(self, client):
        client.post("/api/sim/jump", json={"clock": "03:40", "speed": 0})
        assert client.get("/api/sim").json()["clock"] == "03:40:00"
        state = client.get("/api/live/state").json()
        assert state["active_transmissions"] == [] and state["views"]["bank-nec"]["hero"]["mode"] == "idle"

    def test_bad_jumps_are_rejected(self, client):
        assert client.post("/api/sim/jump", json={"scenario": "nope"}).status_code == 422
        assert client.post("/api/sim/jump", json={"clock": "late"}).status_code == 422
        assert client.post("/api/sim/jump", json={"speed": -1}).status_code == 422


class TestPrefs:
    def test_round_trip(self, client):
        prefs = client.get("/api/prefs").json()
        prefs.update(muted=["amtk-nec-road"], solo=[], volume={"amtk-nec-road": 0.4})
        assert client.put("/api/prefs", json=prefs).json()["volume"] == {"amtk-nec-road": 0.4}
        assert client.get("/api/prefs").json()["muted"] == ["amtk-nec-road"]

    def test_unknown_bank_or_feed_is_rejected(self, client):
        prefs = client.get("/api/prefs").json()
        assert client.put("/api/prefs", json={**prefs, "active_bank": "bank-x"}).status_code == 422
        assert client.put("/api/prefs", json={**prefs, "displayed_feed": "feed-x"}).status_code == 422

    def test_displayed_feed_override_reaches_the_live_state(self, client):
        prefs = client.get("/api/prefs").json()
        client.put("/api/prefs", json={**prefs, "displayed_feed": "feed-bay"})
        assert client.get("/api/live/state").json()["displayed_feed"] == "feed-bay"


class TestFrequencies:
    NEW = {"id": "test-ch", "label": "TEST", "freq_mhz": 160.92, "railroad": "Test", "use": "road"}

    def test_list_and_read(self, client):
        items = client.get("/api/frequencies").json()
        assert len(items) == 31 and items[0]["id"] == "amtk-nec-road" and items[0]["aar_channel"] == 54
        assert client.get("/api/frequencies/amtk-nec-road").json()["freq_mhz"] == 160.92
        assert client.get("/api/frequencies/missing").status_code == 404

    def test_create_derives_the_aar_channel_and_joins_the_live_state(self, client):
        created = client.post("/api/frequencies", json=self.NEW)
        assert created.status_code == 201 and created.json()["aar_channel"] == 54
        assert client.post("/api/frequencies", json=self.NEW).status_code == 409
        assert any(c["id"] == "test-ch" for c in client.get("/api/live/state").json()["channels"])

    def test_a_wrong_aar_channel_is_rejected(self, client):
        assert client.post("/api/frequencies", json={**self.NEW, "aar_channel": 12}).status_code == 422

    def test_update(self, client):
        body = {**client.get("/api/frequencies/amtk-nec-road").json(), "label": "AMTK RENAMED"}
        assert client.put("/api/frequencies/amtk-nec-road", json=body).json()["label"] == "AMTK RENAMED"
        assert client.put("/api/frequencies/other", json=body).status_code in (404, 422)

    def test_delete_refuses_a_channel_in_a_bank_unless_forced(self, client):
        assert client.delete("/api/frequencies/amtk-nec-road").status_code == 409
        assert client.delete("/api/frequencies/amtk-nec-road?force=true").status_code == 204
        assert "amtk-nec-road" not in client.get("/api/banks/bank-nec").json()["frequency_ids"]
        assert client.get("/api/frequencies/amtk-nec-road").status_code == 404
        assert client.get("/api/live/state").status_code == 200  # recorded rows of the gone channel are ignored


class TestBanks:
    def test_list_has_ordered_membership(self, client):
        banks = client.get("/api/banks").json()
        assert [b["id"] for b in banks] == ["bank-nec", "bank-freight", "bank-commuter", "bank-harbor"]
        assert banks[0]["frequency_ids"][0] == "amtk-nec-road" and banks[0]["short"] == "NEC"

    def test_create_update_delete(self, client):
        body = {"id": "bank-new", "name": "New Bank", "home_feed": "feed-lnd", "frequency_ids": []}
        created = client.post("/api/banks", json=body)
        assert created.status_code == 201 and created.json()["short"] == "NEW"
        body["frequency_ids"] = ["csx-road", "amtk-nec-road"]
        assert client.put("/api/banks/bank-new", json=body).json()["frequency_ids"] == ["csx-road", "amtk-nec-road"]
        assert client.delete("/api/banks/bank-new").status_code == 204
        assert client.get("/api/banks/bank-new").status_code == 404

    def test_validation(self, client):
        base = {"id": "b", "name": "B", "home_feed": "feed-lnd", "frequency_ids": []}
        assert client.post("/api/banks", json={**base, "frequency_ids": ["nope"]}).status_code == 422
        assert client.post("/api/banks", json={**base, "home_feed": "nope"}).status_code == 422
        assert client.post("/api/banks", json={**base, "id": "bank-nec"}).status_code == 409

    def test_activate_changes_prefs_and_live_state(self, client):
        prefs = client.post("/api/banks/bank-freight/activate").json()
        assert prefs["active_bank"] == "bank-freight"
        state = client.get("/api/live/state").json()
        assert state["active_bank"] == "bank-freight" and state["displayed_feed"] == "feed-bay"

    def test_the_active_bank_cannot_be_deleted(self, client):
        assert client.delete("/api/banks/bank-nec").status_code == 409


class TestFeeds:
    def test_list_merges_config_and_live_health(self, client):
        feeds = {f["id"]: f for f in client.get("/api/feeds").json()}
        assert set(feeds) == {"feed-alx", "feed-lnd", "feed-bwi", "feed-bay"}
        bay = feeds["feed-bay"]
        assert bay["state"] == "ok" and bay["driver"] == "sdrviz-agent · SIM" and bay["telemetry"]["device_drops"] == 0
        assert bay["host"] and bay["coverage_radius_km"] == 22

    def test_create_update_delete(self, client):
        body = {
            "id": "feed-new",
            "name": "NEW-05 Test",
            "lat": 39.0,
            "lon": -76.8,
            "coverage_radius_km": 10,
            "hears": ["csx-road"],
        }
        created = client.post("/api/feeds", json=body)
        assert created.status_code == 201 and created.json()["short"] == "NEW-05" and created.json()["state"] == "ok"
        assert client.put("/api/feeds/feed-new", json={**body, "gain_db": 20}).json()["gain_db"] == 20
        assert client.delete("/api/feeds/feed-new").status_code == 204
        assert client.delete("/api/feeds/feed-lnd").status_code == 409  # home feed of a bank

    def test_ack_needs_an_unacknowledged_fault(self, client):
        assert client.post("/api/feeds/feed-lnd/ack").status_code == 409  # healthy at 14:07:30
        client.post("/api/sim/jump", json={"scenario": "fault", "speed": 0})
        acked = client.post("/api/feeds/feed-lnd/ack", json={"reason": "cable"})
        assert acked.status_code == 200 and acked.json()["acked"] is True
        assert client.post("/api/feeds/feed-lnd/ack").status_code == 409  # already acked
        state = client.get("/api/live/state").json()
        assert state["header"]["feeds_chip"] == "FEEDS 2/4 · 1 ACK'D"

    def test_a_scenario_jump_forgets_user_acks(self, client):
        client.post("/api/sim/jump", json={"scenario": "fault", "speed": 0})
        client.post("/api/feeds/feed-lnd/ack")
        client.post("/api/sim/jump", json={"scenario": "fault", "speed": 0})
        assert client.get("/api/feeds/feed-lnd").json()["acked"] is False

    def test_health_series(self, client):
        health = client.get("/api/feeds/feed-bay/health?minutes=30").json()
        assert health["minutes"] == 30 and len(health["series_1m"]["noise_floor_dbfs"]) == 30
        assert {e["state"] for e in health["events"]} == {"stale", "fault", "ok"}

    def test_waterfall_backfill_is_binary_rows(self, client):
        response = client.get("/api/feeds/feed-bay/waterfall?rows=8")
        assert response.status_code == 200 and response.headers["content-type"] == "application/octet-stream"
        assert response.headers["x-bins"] == "1024" and response.headers["x-row-seconds"] == "0.25"
        assert response.headers["x-center-mhz"] == "160.89" and response.headers["x-span-mhz"] == "2.4"
        assert len(response.content) == 8 * 1024

    def test_a_feed_with_a_keyed_channel_shows_a_signal_above_its_floor(self, client):
        rows = client.get("/api/feeds/feed-bay/waterfall?rows=2").content
        last = rows[-1024:]
        peak = max(b - 256 if b > 127 else b for b in last)
        assert peak > -20  # CH66 is keyed at -12.9 dBFS on BAY-04


class TestOther:
    def test_stats_ranges(self, client):
        today = client.get("/api/stats?range=today").json()
        yesterday = client.get("/api/stats?range=yesterday").json()
        rolling = client.get("/api/stats?range=rolling_24h").json()
        assert yesterday["totals"]["count"] == 1265
        assert (
            today["totals"]["count"] < yesterday["totals"]["count"]
            and rolling["totals"]["count"] == yesterday["totals"]["count"]
        )
        assert client.get("/api/stats?range=bogus").status_code == 422

    def test_trains(self, client):
        items = client.get("/api/trains").json()["items"]
        assert len(items) == 136 and items[0]["stops"]
        marc = client.get("/api/trains?q=marc 41").json()["items"]
        assert marc and all("MARC 41" in t["train_id"] for t in marc)
        assert all("r-capital" in t["routes"] for t in client.get("/api/trains?route=r-capital").json()["items"])
        window = client.get("/api/trains?start=2026-11-10T14:00:00-05:00&end=2026-11-10T14:10:00-05:00").json()["items"]
        assert 0 < len(window) < 136

    def test_live_trains_match_the_live_state(self, client):
        live = client.get("/api/trains/live").json()
        assert [t["train_id"] for t in live] == [
            t["train_id"] for t in client.get("/api/live/state").json()["trains"]["positions"]
        ]

    def test_geo(self, client):
        rail = client.get("/api/geo/rail")
        assert rail.status_code == 200 and rail.headers["content-type"] == "application/geo+json"
        assert "max-age" in rail.headers["cache-control"] and rail.json()["type"] == "FeatureCollection"
        again = client.get("/api/geo/rail", headers={"If-None-Match": rail.headers["etag"]})
        assert again.status_code == 304
        assert client.get("/api/geo/water").status_code == 200
        assert "stations" in client.get("/api/geo/places").json()
        assert client.get("/api/geo/routes").json()["routes"]

    def test_lofar(self, client):
        body = client.get("/api/lofar?minutes=10").json()
        assert body["row_s"] == 30 and body["rows"] == 20
        assert set(body["cells"]) == {"feed-alx", "feed-lnd", "feed-bwi", "feed-bay"}
        values = [v for channels in body["cells"].values() for row in channels.values() for v in row if v is not None]
        assert values and all(len(row) == 20 for channels in body["cells"].values() for row in channels.values())

    def test_openapi_lists_the_contract(self, client):
        paths = client.get("/openapi.json").json()["paths"]
        for path in (
            "/api/transmissions/{tx_id}/audio",
            "/api/feeds/{feed_id}/ack",
            "/api/banks/{bank_id}/activate",
            "/api/sim/jump",
        ):
            assert path in paths
