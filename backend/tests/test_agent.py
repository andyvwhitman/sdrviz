"""The sdrviz-node agent: config files, enrollment, and the whole path to a real server with a replayed recording."""

import asyncio
import json
import stat
import time

import httpx
import numpy as np
import pytest
from websockets.asyncio.client import connect

from app.live import node_protocol as wire
from app.live import protocol
from app.node.agent import agent as agent_module
from app.node.agent import uplink as uplink_module
from app.node.agent.agent import Agent, aar_freq_hz
from app.node.agent.cli import main
from app.node.agent.config import ConfigDir, Credentials
from app.node.agent.enroll import EnrollError, enroll, read_key
from app.node.agent.sources import ReplaySource
from app.node.agent.uplink import backoff_delay

from .conftest import PASSWORD
from .live_server import LiveServer
from .test_radio_dsp import CENTER, RATE, rtl_bytes

PORT_A, PORT_B = 8162, 8163
LOCATION = {"lat": 38.9, "lon": -77.0}


# --- config and small pieces ---------------------------------------------------------------------------------------


def test_aar_channel_frequencies():
    assert aar_freq_hz(7) == 160_215_000 and aar_freq_hz(54) == 160_920_000 and aar_freq_hz(97) == 161_565_000


def test_backoff_grows_to_a_minute_with_jitter():
    for failures, top in ((0, 1), (1, 2), (2, 4), (5, 32), (6, 60), (20, 60)):
        delays = [backoff_delay(failures) for _ in range(50)]
        assert top * 0.5 <= min(delays) and max(delays) <= top


def test_credentials_are_written_atomically_with_mode_0600(tmp_path):
    config = ConfigDir(tmp_path / "etc")
    assert config.credentials() is None
    config.save_credentials(Credentials("https://sdr.example.com", "node-abc", "s3cret"))
    path = tmp_path / "etc" / "node.json"
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert config.credentials() == Credentials("https://sdr.example.com", "node-abc", "s3cret")
    assert [p.name for p in (tmp_path / "etc").iterdir()] == ["node.json"]  # no temp file left behind


def test_settings_defaults_toml_then_state(tmp_path):
    config = ConfigDir(tmp_path)
    assert config.settings().rtl_host == "127.0.0.1" and config.settings().channels is None
    (tmp_path / "agent.toml").write_text('rtl_host = "pi.local"\nsquelch_db = 6.0\nworkers = 2\n')
    (tmp_path / "state.json").write_text(json.dumps({"squelch_db": 11.0, "channels": [54, 16]}))
    settings = config.settings()
    assert (settings.rtl_host, settings.squelch_db, settings.channels, settings.workers) == (
        "pi.local",
        11.0,
        [54, 16],
        2,
    )
    (tmp_path / "agent.toml").write_text("bogus = 1\n")
    with pytest.raises(ValueError, match="bogus"):
        config.settings()


def test_read_key_takes_the_key_or_a_file(tmp_path):
    key = wire.NodeKey("http://x", "node-a", "s").encode()
    (tmp_path / "n.key").write_text(key + "\n")
    assert read_key(key) == key and read_key(str(tmp_path / "n.key")) == key


def test_replay_source_loops_and_paces(tmp_path):
    path = tmp_path / "x.iq"
    path.write_bytes(bytes(range(10)))

    async def read():
        source = ReplaySource(path, pace=0)
        await source.connect()
        await source.tune(0, 1000, None)
        return await source.read_block(14), await source.read_block(8)

    assert asyncio.run(read()) == (bytes(range(10)) + bytes(range(4)), bytes(range(4, 10)) + bytes(range(2)))


def test_status_command_reports(tmp_path, capsys):
    assert main(["--config-dir", str(tmp_path), "status"]) == 1
    assert "not enrolled" in capsys.readouterr().out
    config = ConfigDir(tmp_path)
    config.save_credentials(Credentials("http://x", "node-a", "s"))
    config.write_status(
        {"version": "0.1.0", "uplink": "online", "detail": "", "reconnects": 2, "rtl_tcp": "connected",
         "channels": 91, "dropped_blocks": 0, "updated": time.time()}
    )  # fmt: skip
    assert main(["--config-dir", str(tmp_path), "status"]) == 0
    assert "online" in capsys.readouterr().out


# --- against a real server ------------------------------------------------------------------------------------------


def recording(path):
    """Quiet, then a keyed carrier on AAR 54, then quiet again (all uint8 I/Q at 2.4 MS/s)."""
    quiet = np.random.default_rng(2).normal(127.5, 2.5, int(1.2 * RATE) * 2).clip(0, 255).astype(np.uint8).tobytes()
    path.write_bytes(quiet + rtl_bytes(1.0) + quiet[:RATE])
    return path


@pytest.fixture
def servers(settings):
    started = []

    def start(port):
        server = LiveServer(settings, port).start()
        started.append(server)
        return server

    yield start
    for server in started:
        server.stop()


class Api:
    def __init__(self, server: LiveServer):
        self.server = server
        self.http = httpx.AsyncClient(base_url=server.url)

    async def login(self):
        assert (await self.http.post("/api/auth/login", json={"password": PASSWORD})).status_code == 204

    async def create_node(self) -> tuple[str, str]:
        created = (
            await self.http.post("/api/nodes", json={"name": "Roof", "location": LOCATION, "preset": "aar"})
        ).json()
        return created["node"]["id"], created["key"]

    async def node(self, node_id) -> dict:
        return (await self.http.get(f"/api/nodes/{node_id}")).json()

    async def wait_status(self, node_id, wanted, timeout=15.0):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if (await self.node(node_id)).get("status") == wanted:
                return
            await asyncio.sleep(0.05)
        raise AssertionError(f"node never became {wanted}: {await self.node(node_id)}")

    async def command(self, node_id, body) -> dict:
        response = await self.http.post(f"/api/nodes/{node_id}/commands", json=body, timeout=40)
        assert response.status_code == 200, response.text
        return response.json()

    def cookie(self) -> str:
        return "; ".join(f"{k}={v}" for k, v in self.http.cookies.items())


def make_agent(tmp_path, recording_path, **settings) -> Agent:
    config_dir = tmp_path / "etc"
    config_dir.mkdir(exist_ok=True)
    lines = [f"rate = {RATE}", f"center_hz = {CENTER}", "workers = 2"] + [f"{k} = {v!r}" for k, v in settings.items()]
    (config_dir / "agent.toml").write_text("\n".join(lines) + "\n")
    return Agent(ConfigDir(config_dir), lambda s: ReplaySource(recording_path, pace=0.25))


def test_enroll_run_and_stream_to_the_browser(servers, tmp_path, monkeypatch):
    server = servers(PORT_A)
    agent = make_agent(tmp_path, recording(tmp_path / "rec.iq"))

    async def scenario():
        api = Api(server)
        await api.login()
        node_id, key = await api.create_node()
        credentials = await enroll(key, agent.config)  # what `sdrviz-node enroll <key>` does
        assert credentials.node == node_id and agent.config.credentials() == credentials
        await api.wait_status(node_id, "OFFLINE")  # enrolled, not connected yet
        run = asyncio.create_task(agent.run())
        await api.wait_status(node_id, "ONLINE")
        freqs = [f["id"] for f in (await api.http.get("/api/frequencies")).json()]
        channel = next(f["id"] for f in (await api.http.get("/api/frequencies")).json() if f["aar_channel"] == 54)

        seen_kinds, texts, audio = set(), [], []
        async with connect(
            server.url.replace("http", "ws") + "/ws/live", additional_headers={"Cookie": api.cookie()}
        ) as live:
            await live.send(json.dumps({"op": "audio", "channels": freqs}))
            await live.send(json.dumps({"op": "watch", "feed_id": "node-1"}))
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline and not {"keyup", "keydown", "spectrum", "audio"} <= seen_kinds:
                message = await asyncio.wait_for(live.recv(), 10)
                if isinstance(message, bytes):
                    frame = wire.parse_frame(message)
                    if isinstance(frame, wire.AudioFrame):
                        seen_kinds.add("audio")
                        audio.append(frame)
                    else:
                        seen_kinds.add("spectrum")
                else:
                    texts.append(json.loads(message))
                    seen_kinds.add(texts[-1]["type"])
        assert {"keyup", "keydown", "spectrum", "audio"} <= seen_kinds, seen_kinds
        keyup = next(t for t in texts if t["type"] == "keyup")
        assert keyup["channel_id"] == channel and keyup["feed_id"] == "node-1"
        assert audio[0].codec == protocol.CODEC_PCM and audio[0].first and audio[0].ch == 54
        info = await api.node(node_id)
        assert info["health"]["rtl_tcp"] == "connected" and info["health"]["channels"] == 91
        assert info["agent_version"] == "0.1.0" and info["link_quality"] >= 80
        status = agent.config.read_status()
        assert status is None or status["node"] == node_id  # written every 5 s
        run.cancel()
        await asyncio.gather(run, return_exceptions=True)
        await api.http.aclose()

    asyncio.run(scenario())


def test_node_reconnects_after_a_server_restart_with_the_same_secret(servers, tmp_path, monkeypatch):
    monkeypatch.setattr(uplink_module, "backoff_delay", lambda failures: 0.2)
    server = servers(PORT_A)
    agent = make_agent(tmp_path, recording(tmp_path / "rec.iq"))

    async def scenario():
        api = Api(server)
        await api.login()
        node_id, key = await api.create_node()
        await enroll(key, agent.config)
        secret = agent.config.credentials().secret
        run = asyncio.create_task(agent.run())
        await api.wait_status(node_id, "ONLINE")

        await asyncio.to_thread(server.stop)  # the server goes away ...
        assert agent.uplink.status.state in ("connecting", "online")
        again = servers(PORT_A)  # ... and comes back on the same address and database
        api2 = Api(again)
        await api2.login()
        await api2.wait_status(node_id, "ONLINE", timeout=20)
        assert agent.config.credentials().secret == secret and agent.uplink.status.reconnects >= 1
        run.cancel()
        await asyncio.gather(run, return_exceptions=True)
        await api.http.aclose()
        await api2.http.aclose()

    asyncio.run(scenario())


def test_commands_change_the_agent_and_it_remembers(servers, tmp_path):
    server = servers(PORT_A)
    agent = make_agent(tmp_path, recording(tmp_path / "rec.iq"))

    async def scenario():
        api = Api(server)
        await api.login()
        node_id, key = await api.create_node()
        await enroll(key, agent.config)
        run = asyncio.create_task(agent.run())
        await api.wait_status(node_id, "ONLINE")

        assert (await api.command(node_id, {"type": "squelch", "squelch_db": 12.5}))["status"] == "acked"
        assert agent.settings.squelch_db == 12.5 and agent.pipeline.squelch_db == 12.5
        assert (await api.command(node_id, {"type": "gain", "gain_db": None}))["status"] == "acked"
        assert agent.settings.gain_db is None
        assert (await api.command(node_id, {"type": "channels", "channels": [54, 16, 8]}))["status"] == "acked"
        assert agent.settings.channels == [8, 16, 54]
        await asyncio.sleep(0.5)
        assert len(agent.pipeline.channels) == 3
        tuned = await api.command(node_id, {"type": "tune", "center_hz": 160_890_000, "rate": 2_400_000})
        assert tuned["status"] == "acked" and agent.settings.center_hz == 160_890_000
        saved = json.loads((agent.config.path / "state.json").read_text())
        assert saved == {
            "center_hz": 160_890_000,
            "rate": 2_400_000,
            "gain_db": None,
            "squelch_db": 12.5,
            "channels": [8, 16, 54],
        }
        assert ConfigDir(agent.config.path).settings().squelch_db == 12.5  # a restart picks it up

        # a bad value is refused by the agent and the settings stay
        bad = agent_module.Agent.on_command  # the REST layer validates the rate first, so ask the agent directly
        ack = await bad(agent, wire.TuneCommand(id="x", center_hz=160_000_000, rate=1_000_000))
        assert not ack.ok and ack.error.code == "bad_value" and agent.settings.rate == 2_400_000

        assert (await api.command(node_id, {"type": "restart"}))["status"] == "acked"
        await asyncio.wait_for(run, 10)  # run() returns: the process exits and systemd starts it again
        await api.http.aclose()

    asyncio.run(scenario())


def test_set_server_good_and_bad(servers, tmp_path):
    first, second = servers(PORT_A), servers(PORT_B)
    agent = make_agent(tmp_path, recording(tmp_path / "rec.iq"))

    async def scenario():
        api, other = Api(first), Api(second)
        await api.login()
        await other.login()
        node_id, key = await api.create_node()
        await enroll(key, agent.config)
        run = asyncio.create_task(agent.run())
        await api.wait_status(node_id, "ONLINE")

        refused = await api.command(node_id, {"type": "set_server", "url": "http://127.0.0.1:1"})
        assert refused["status"] == "failed" and "could not use" in refused["error"]["message"]
        assert agent.config.credentials().url == first.url  # the old address is kept

        moved = await api.command(node_id, {"type": "set_server", "url": second.url})
        assert moved["status"] == "acked" and agent.config.credentials().url == second.url
        await other.wait_status(node_id, "ONLINE", timeout=20)  # it reconnects to the new server by itself
        await api.wait_status(node_id, "OFFLINE")
        run.cancel()
        await asyncio.gather(run, return_exceptions=True)
        await api.http.aclose()
        await other.http.aclose()

    asyncio.run(scenario())


def test_revoked_node_stops_retrying_and_a_new_key_file_brings_it_back(servers, tmp_path, monkeypatch):
    monkeypatch.setattr(uplink_module, "CREDENTIAL_POLL_S", 0.2)
    monkeypatch.setattr(uplink_module, "backoff_delay", lambda failures: 0.2)
    server = servers(PORT_A)
    agent = make_agent(tmp_path, recording(tmp_path / "rec.iq"))

    async def scenario():
        api = Api(server)
        await api.login()
        node_id, key = await api.create_node()
        await enroll(key, agent.config)
        run = asyncio.create_task(agent.run())
        await api.wait_status(node_id, "ONLINE")
        await api.http.post(f"/api/nodes/{node_id}/revoke")
        deadline = time.monotonic() + 10
        while agent.uplink.status.state != "stopped" and time.monotonic() < deadline:
            await asyncio.sleep(0.05)
        assert agent.uplink.status.state == "stopped" and "4403" in agent.uplink.status.detail
        assert agent.rtl_state == "connected"  # the receiver keeps running

        rekeyed = (await api.http.post(f"/api/nodes/{node_id}/rekey")).json()
        (agent.config.path / "new.key").write_text(rekeyed["key"])  # dropped into /etc/sdrviz-node
        await api.wait_status(node_id, "ONLINE", timeout=20)
        assert not (agent.config.path / "new.key").exists()  # used and deleted
        run.cancel()
        await asyncio.gather(run, return_exceptions=True)
        await api.http.aclose()

    asyncio.run(scenario())


def test_enroll_errors_are_readable(servers, tmp_path, capsys):
    server = servers(PORT_A)
    config = ConfigDir(tmp_path)
    with pytest.raises(EnrollError, match="not a node key"):
        asyncio.run(enroll("garbage", config))
    dead = wire.NodeKey("http://127.0.0.1:1", "node-x", "s").encode()
    with pytest.raises(EnrollError, match="could not reach"):
        asyncio.run(enroll(dead, config))
    wrong = wire.NodeKey(server.url, "node-nope1234", "s").encode()
    with pytest.raises(EnrollError, match="refused"):
        asyncio.run(enroll(wrong, config))
    assert main(["--config-dir", str(tmp_path), "enroll", wrong]) == 1
    assert "enrollment failed" in capsys.readouterr().err
    assert config.credentials() is None
