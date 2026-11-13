"""Receiver settings: validation, persistence, the live feed row and the reconfigure logic (no network)."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models import Receiver
from app.radio.receiver import default_receiver, is_active, retunes
from app.radio.source import RadioSource
from app.schemas import ReceiverIn

SETTINGS = {
    "name": "SDR-02 Roof",
    "host": "roof.local",
    "port": 1234,
    "freq_hz": 160_890_000,
    "rate": 1_536_000,
    "gain_db": 30.0,
    "squelch_db": 10.0,
    "lat": 38.9,
    "lon": -77.0,
    "enabled": True,
}


@pytest.fixture
def calls(monkeypatch):
    """Replace the connection with a recorder, so no test opens a socket."""
    recorded: list[str] = []
    monkeypatch.setattr(RadioSource, "start", lambda self: recorded.append(f"start {self.config.host}"))

    async def stop(self) -> None:
        recorded.append("stop")

    monkeypatch.setattr(RadioSource, "stop", stop)
    return recorded


def test_defaults_come_from_config(client):
    body = client.get("/api/radio/settings").json()
    assert body["name"] == "SDR-01 Pi"
    assert body["host"] == ""
    assert body["rate"] == 1_536_000
    assert client.get("/api/radio").json()["state"] == "off"


def test_put_saves_and_updates_the_live_feed(client, calls):
    assert client.put("/api/radio/settings", json=SETTINGS).status_code == 200
    assert client.get("/api/radio/settings").json() == SETTINGS
    assert client.get("/api/feeds/feed-live").status_code == 200  # not a table row, but served from the world
    assert client.get("/api/feeds/feed-live/health?minutes=1").status_code == 200
    assert client.get("/api/feeds/feed-live/waterfall?rows=2").content == bytes([0x81]) * 2048  # empty history
    live = next(f for f in client.get("/api/feeds").json() if f["id"] == "feed-live")
    assert (live["name"], live["lat"], live["lon"], live["host"]) == ("SDR-02 Roof", 38.9, -77.0, "roof.local")
    assert calls == ["stop", "start roof.local"]


def test_settings_survive_a_restart(settings, client, calls):
    client.put("/api/radio/settings", json=SETTINGS)
    with TestClient(create_app(settings)) as again:
        again.post("/api/auth/login", json={"password": settings.password})
        assert again.get("/api/radio/settings").json() == SETTINGS


def test_squelch_only_change_does_not_reconnect(client, calls):
    client.put("/api/radio/settings", json=SETTINGS)
    calls.clear()
    client.put("/api/radio/settings", json={**SETTINGS, "squelch_db": 12.0, "name": "Renamed", "lat": 39.0})
    assert calls == []


@pytest.mark.parametrize(
    ("change", "field"),
    [
        ({"rate": 1_000_000}, "rate"),  # not a multiple of 48 000
        ({"rate": 480_000}, "rate"),  # a multiple, but the RTL-SDR cannot sample there
        ({"port": 0}, "port"),
        ({"freq_hz": 10_000_000}, "freq_hz"),
        ({"gain_db": 80}, "gain_db"),
        ({"lat": 91}, "lat"),
        ({"lon": -181}, "lon"),
        ({"host": "bad host!"}, "host"),
        ({"name": ""}, "name"),
        ({"host": ""}, "__root__"),  # enabled needs a host
    ],
)
def test_invalid_settings_are_rejected(client, calls, change, field):
    response = client.put("/api/radio/settings", json={**SETTINGS, **change})
    assert response.status_code == 422
    assert client.get("/api/radio/settings").json()["host"] == ""  # nothing saved
    if field != "__root__":
        assert field in response.text


def test_auto_gain_and_disabled_without_host(client, calls):
    body = {**SETTINGS, "gain_db": None, "enabled": False, "host": ""}
    assert client.put("/api/radio/settings", json=body).status_code == 200
    assert client.get("/api/radio/settings").json()["gain_db"] is None
    assert client.get("/api/radio").json()["state"] == "off"


def test_rate_message_explains_the_48k_rule():
    with pytest.raises(ValueError, match="multiple of 48000"):
        ReceiverIn(**{**SETTINGS, "rate": 1_000_000})


def test_requires_login(anonymous):
    assert anonymous.get("/api/radio/settings").status_code == 401
    assert anonymous.put("/api/radio/settings", json=SETTINGS).status_code == 401


def test_retunes_only_for_tuner_changes(settings):
    old = Receiver(id=1, **SETTINGS)
    assert not retunes(old, old.model_copy(update={"squelch_db": 3.0, "name": "x", "lat": 0.0}))
    tuner_changes = {"host": "other.local", "port": 1235, "freq_hz": 161_000_000, "rate": 960_000, "gain_db": None}
    for key, value in tuner_changes.items():
        assert retunes(old, old.model_copy(update={key: value})), key
    assert retunes(old, old.model_copy(update={"enabled": False}))
    assert not is_active(old.model_copy(update={"enabled": False}))
    assert not is_active(default_receiver(settings))  # no host configured


def test_reconfigure_adjusts_running_squelch(client, calls):
    radio = client.app.state.rt.radio
    radio.config = Receiver(id=1, **SETTINGS)

    class Rx:
        squelch = type("Sq", (), {"open_db": 8.0, "close_db": 5.0})()

    radio.channels["ch"] = Rx()
    asyncio.run(radio.reconfigure(radio.config.model_copy(update={"squelch_db": 12.0})))
    assert (Rx.squelch.open_db, Rx.squelch.close_db) == (12.0, 9.0)
    assert calls == []
