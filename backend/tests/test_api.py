"""REST endpoints. The sim clock is frozen at 14:07:30 (the `keyed` moment) unless a test jumps it."""

from .conftest import PASSWORD


class TestAuth:
    def test_everything_but_login_and_session_needs_a_cookie(self, anonymous):
        for path in ("/api/system", "/api/live/state", "/api/prefs", "/api/frequencies", "/api/trains"):
            assert anonymous.get(path).status_code == 401
        assert anonymous.get("/api/auth/session").json() == {"authenticated": False, "sim": True, "role": None}

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
        assert state["clock"] == "14:07:30" and state["listen_feed"] == "feed-alx"  # the first feed
        assert not {"active_bank", "banks", "views", "displayed_feed"} & set(state)
        assert {
            "header",
            "feeds",
            "channels",
            "feeds_listenable",
            "active_transmissions",
            "transcript",
            "trains",
            "ctc",
            "lofar_60m",
        } <= set(state)
        assert len(state["feeds"]) == 4
        assert sorted(t["aar"] for t in state["active_transmissions"]) == ["CH08", "CH54", "CH66"]
        assert len(state["channels"][0]["spark_60m"]) == 60
        assert "banks" not in state["channels"][0] and "off_bank" not in state["transcript"]["rows"][0]

    def test_channels_are_the_listened_feeds_enabled_frequencies_low_to_high(self, client):
        rt = client.app.state.rt
        state = client.get("/api/live/state").json()
        feed = rt.world.feeds[state["listen_feed"]]
        mhz = [c["freq_mhz"] for c in state["channels"]]
        assert {c["id"] for c in state["channels"]} == set(feed.hears) and mhz == sorted(mhz)
        state = client.get("/api/live/state", params={"listen_feed": "feed-bay"}).json()
        assert state["listen_feed"] == "feed-bay"
        assert {c["id"] for c in state["channels"]} == set(rt.world.feeds["feed-bay"].hears)
        client.put("/api/frequencies/amtk-nec-road/assignments/feed-bay", json={"enabled": False})
        state = client.get("/api/live/state", params={"listen_feed": "feed-bay"}).json()
        assert "amtk-nec-road" not in [c["id"] for c in state["channels"]]

    def test_the_node_picker_lists_every_feed(self, client):
        listed = client.get("/api/live/state").json()["feeds_listenable"]
        assert [f["feed_id"] for f in listed] == ["feed-alx", "feed-lnd", "feed-bwi", "feed-bay"]
        assert listed[0] == {"feed_id": "feed-alx", "name": listed[0]["name"], "short": "ALX-01", "online": True}
        client.post("/api/sim/jump", json={"scenario": "fault", "speed": 0})
        online = {f["feed_id"]: f["online"] for f in client.get("/api/live/state").json()["feeds_listenable"]}
        assert online["feed-lnd"] is False and online["feed-bay"] is True  # LINK LOST; STALE still counts as up

    def test_system(self, client):
        body = client.get("/api/system").json()
        assert set(body) >= {"host", "decoder", "disk", "version", "sim"} and body["decoder"]["state"] == "ok"

    def test_system_backend(self, client):
        body = client.get("/api/system/backend").json()
        assert body["build"]["version"] and body["uptime_s"] >= 0
        assert body["memory"]["rss_bytes"] > 0 and body["disk"]["db_bytes"] > 0
        assert body["websocket"]["clients"] == 0


class TestSim:
    def test_jump_to_a_scenario_sets_clock_node_and_state(self, client):
        response = client.post("/api/sim/jump", json={"scenario": "fault", "speed": 0})
        assert response.json() == {"scenario": "fault", "clock": "14:06:22", "speed": 0.0, "scenario_feed": "feed-lnd"}
        assert "listen_feed" not in client.get("/api/prefs").json()  # the node listened to is each client's own
        state = client.get("/api/live/state").json()
        assert state["header"]["feeds_chip"] == "FEEDS 2/4" and state["scenario"] == "fault"
        assert [f["object"] for f in state["faults"]] == ["feed-lnd"]

    def test_jump_to_a_clock_time(self, client):
        client.post("/api/sim/jump", json={"clock": "03:40", "speed": 0})
        assert client.get("/api/sim").json()["clock"] == "03:40:00"
        state = client.get("/api/live/state").json()
        assert state["active_transmissions"] == [] and not any(c["tx"] for c in state["channels"])

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

    def test_the_listened_feed_is_not_a_pref(self, client):
        prefs = client.get("/api/prefs").json()
        assert "listen_feed" not in prefs and "active_bank" not in prefs and "displayed_feed" not in prefs
        client.put("/api/prefs", json={**prefs, "listen_feed": "feed-bay"})  # ignored
        assert client.get("/api/live/state").json()["listen_feed"] == "feed-alx"

    def test_live_state_listens_to_the_feed_asked_for_and_falls_back_to_the_default(self, client):
        assert client.get("/api/live/state", params={"listen_feed": "feed-bay"}).json()["listen_feed"] == "feed-bay"
        assert client.get("/api/live/state", params={"listen_feed": "feed-x"}).json()["listen_feed"] == "feed-alx"


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
        client.put("/api/frequencies/test-ch/assignments/feed-alx", json={"enabled": True})
        assert any(c["id"] == "test-ch" for c in client.get("/api/live/state").json()["channels"])

    def test_a_wrong_aar_channel_is_rejected(self, client):
        assert client.post("/api/frequencies", json={**self.NEW, "aar_channel": 12}).status_code == 422

    def test_update(self, client):
        body = {**client.get("/api/frequencies/amtk-nec-road").json(), "label": "AMTK RENAMED"}
        assert client.put("/api/frequencies/amtk-nec-road", json=body).json()["label"] == "AMTK RENAMED"
        assert client.put("/api/frequencies/other", json=body).status_code in (404, 422)

    def test_delete_removes_the_frequency_and_its_assignments(self, client):
        assert client.delete("/api/frequencies/amtk-nec-road").status_code == 204
        assert client.get("/api/frequencies/amtk-nec-road").status_code == 404
        assert client.get("/api/live/state").status_code == 200  # recorded rows of the gone channel are ignored
        client.post("/api/frequencies", json=self.NEW | {"id": "amtk-nec-road", "label": "NEW"})
        assert client.get("/api/frequencies/amtk-nec-road").json()["assignments"] == []

    def test_list_and_read_carry_the_assignments(self, client):
        road = client.get("/api/frequencies/amtk-nec-road").json()
        assert {"feed_id": "feed-lnd", "enabled": True} in road["assignments"]
        listed = next(f for f in client.get("/api/frequencies").json() if f["id"] == "amtk-nec-road")
        assert listed["assignments"] == road["assignments"]

    def test_assign_enable_disable_and_unassign(self, client):
        url = "/api/frequencies/csx-road/assignments/feed-bwi"

        def states(response) -> dict[str, bool]:
            return {a["feed_id"]: a["enabled"] for a in response.json()["assignments"]}

        def hears() -> list[str]:
            return client.app.state.rt.world.feeds["feed-bwi"].hears

        assert states(client.put(url, json={"enabled": False}))["feed-bwi"] is False
        assert "csx-road" not in hears()
        assert states(client.put(url, json={"enabled": True}))["feed-bwi"] is True
        assert "csx-road" in hears()
        again = client.put(url, json={"enabled": True})
        assert [a["feed_id"] for a in again.json()["assignments"]].count("feed-bwi") == 1
        assert "feed-bwi" not in states(client.delete(url))
        assert "csx-road" not in hears()
        assert client.delete(url).status_code == 404

    def test_assignment_errors(self, client):
        assert client.put("/api/frequencies/nope/assignments/feed-lnd", json={"enabled": True}).status_code == 404
        assert client.put("/api/frequencies/amtk-nec-road/assignments/nope", json={"enabled": True}).status_code == 404

    def test_from_channel_makes_a_frequency_labelled_with_the_number_twice(self, client):
        body = {"aar_channel": 7, "feed_id": "feed-lnd"}
        first = client.post("/api/frequencies/from-channel", json=body)
        made = first.json()
        assert made["created"] is True
        assert made["frequency"]["id"] == "live-ch07" and made["frequency"]["label"] == "0707"
        assert made["frequency"]["freq_mhz"] == 160.215
        assert made["frequency"]["assignments"] == [{"feed_id": "feed-lnd", "enabled": True}]
        again = client.post("/api/frequencies/from-channel", json=body).json()
        assert again["created"] is False and again["frequency"]["assignments"] == made["frequency"]["assignments"]

    def test_from_channel_reuses_a_frequency_and_enables_it(self, client):
        client.put("/api/frequencies/amtk-nec-road/assignments/feed-bwi", json={"enabled": False})
        body = {"aar_channel": 54, "feed_id": "feed-bwi"}
        reused = client.post("/api/frequencies/from-channel", json=body).json()
        assert reused["created"] is False and reused["frequency"]["id"] == "amtk-nec-road"
        assert {"feed_id": "feed-bwi", "enabled": True} in reused["frequency"]["assignments"]
        assert client.post("/api/frequencies/from-channel", json={**body, "feed_id": "nope"}).status_code == 422
        assert client.post("/api/frequencies/from-channel", json={**body, "aar_channel": 0}).status_code == 422

    def test_banks_are_gone(self, client):
        assert client.get("/api/banks").status_code == 404


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
            "hears": ["csx-road"],  # ignored: a feed hears its enabled assignments
        }
        created = client.post("/api/feeds", json=body)
        assert created.status_code == 201 and created.json()["short"] == "NEW-05" and created.json()["state"] == "ok"
        assert created.json()["hears"] == []
        client.put("/api/frequencies/csx-road/assignments/feed-new", json={"enabled": True})
        assert client.put("/api/feeds/feed-new", json={**body, "gain_db": 20}).json()["gain_db"] == 20
        assert client.delete("/api/feeds/feed-new").status_code == 204
        csx = client.get("/api/frequencies/csx-road").json()
        assert all(a["feed_id"] != "feed-new" for a in csx["assignments"])  # its assignments went with it

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
            "/api/feeds/{feed_id}/ack",
            "/api/sim/jump",
        ):
            assert path in paths


def test_prefs_patch_changes_only_the_fields_sent(client):
    start = client.get("/api/prefs").json()
    client.patch("/api/prefs", json={"volume": {"amtk-nec-road": 0.4}})
    saved = client.patch("/api/prefs", json={"muted": ["amtk-nec-road"]}).json()
    assert saved["muted"] == ["amtk-nec-road"]
    assert saved["volume"] == {"amtk-nec-road": 0.4}  # a stale copy of the volume is not re-sent
    assert saved["solo"] == start["solo"]
