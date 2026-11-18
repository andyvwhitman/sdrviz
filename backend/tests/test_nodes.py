"""Node registry and /api/nodes: enrollment keys, node secrets, revoke and re-key, and that no secret leaks."""

import sqlite3
from datetime import timedelta

import pytest

from app.live import node_protocol as wire
from app.nodes.service import AuthError, NodeRegistry, utcnow

LOCATION = {"lat": 38.9, "lon": -77.0}


@pytest.fixture
def registry(client) -> NodeRegistry:
    return client.app.state.rt.nodes


def create(client, name="Roof", **extra):
    response = client.post("/api/nodes", json={"name": name, "location": LOCATION, **extra})
    assert response.status_code == 201, response.text
    return response.json()


def hello(key: str, mode="enroll", secret=None, node=None, protocol=wire.PROTOCOL_VERSION) -> wire.Hello:
    decoded = wire.NodeKey.decode(key)
    return wire.Hello(
        protocol=protocol,
        agent_version="0.1",
        node=node or decoded.node,
        mode=mode,
        secret=secret or decoded.secret,
    )


def enroll(registry, key, ack=True) -> str:
    """Enroll like a node would; returns the permanent node secret."""
    auth = registry.authenticate(hello(key), "10.0.0.1")
    assert auth.node_secret
    if ack:
        assert registry.acknowledge_enrollment(auth.node.id)
    return auth.node_secret


def refused(registry, hello_message, client="10.0.0.1", **kwargs) -> int:
    with pytest.raises(AuthError) as error:
        registry.authenticate(hello_message, client, **kwargs)
    return error.value.close_code


# --- keys and enrollment ------------------------------------------------------------------------------------------


def test_created_node_is_pending_and_its_key_decodes(client):
    created = create(client)
    node, key = created["node"], wire.NodeKey.decode(created["key"])
    assert node["status"] == "PENDING" and node["number"] == 1 and node["feed_id"] == "node-1"
    assert node["preset"] == "banks" and node["location"] == LOCATION and node["link_quality"] is None
    assert key.node == node["id"] and key.url == "http://localhost:8100" and len(key.secret) == 43
    assert node["key_expires_at"] is not None
    assert create(client, "Second")["node"]["number"] == 2


def test_enrollment_then_connect_with_the_node_secret(client, registry):
    key = create(client)["key"]
    node_secret = enroll(registry, key)
    assert client.get("/api/nodes").json()[0]["status"] == "OFFLINE"
    assert client.get("/api/nodes").json()[0]["key_expires_at"] is None
    auth = registry.authenticate(hello(key, "connect", node_secret), "10.0.0.1")
    assert auth.node_secret is None and auth.channels == registry.bank_channels()
    assert auth.channels and auth.channels == sorted(set(auth.channels))


def test_expired_key_is_rejected(client, registry):
    key = create(client)["key"]
    assert refused(registry, hello(key), now=utcnow() + timedelta(hours=24, minutes=1)) == wire.CLOSE_KEY_EXPIRED


def test_second_use_of_a_key_is_rejected(client, registry):
    key = create(client)["key"]
    enroll(registry, key)
    assert refused(registry, hello(key)) == wire.CLOSE_KEY_EXPIRED


def test_lost_ack_the_new_secret_works_and_counts_as_the_ack(client, registry):
    key = create(client)["key"]
    node_secret = enroll(registry, key, ack=False)
    assert client.get("/api/nodes").json()[0]["status"] == "PENDING"
    registry.authenticate(hello(key, "connect", node_secret), "10.0.0.1")
    assert client.get("/api/nodes").json()[0]["status"] == "OFFLINE"
    assert refused(registry, hello(key)) == wire.CLOSE_KEY_EXPIRED  # the key is burned now


def test_lost_secret_before_the_ack_enrolls_again_with_a_fresh_secret(client, registry):
    key = create(client)["key"]
    first = enroll(registry, key, ack=False)
    second = enroll(registry, key)
    assert first != second
    assert refused(registry, hello(key, "connect", first)) == wire.CLOSE_UNAUTHORIZED
    registry.authenticate(hello(key, "connect", second), "10.0.0.1")


def test_wrong_secret_unknown_node_and_protocol(client, registry):
    key = create(client)["key"]
    assert refused(registry, hello(key, "connect", "wrong")) == wire.CLOSE_UNAUTHORIZED  # no secret issued yet
    assert refused(registry, hello(key, secret="wrong")) == wire.CLOSE_UNAUTHORIZED
    assert refused(registry, hello(key, node="node-nope1234")) == wire.CLOSE_UNAUTHORIZED
    assert refused(registry, hello(key, protocol=2)) == wire.CLOSE_UNSUPPORTED


def test_failed_attempts_are_limited_per_client_address(client, registry):
    key = create(client)["key"]
    for _ in range(5):
        assert refused(registry, hello(key, secret="wrong"), client="6.6.6.6") == wire.CLOSE_UNAUTHORIZED
    assert refused(registry, hello(key), client="6.6.6.6") == wire.CLOSE_RATE_LIMITED  # even the right key
    registry.authenticate(hello(key), "10.0.0.1")  # another address is unaffected


# --- revoke and re-key -------------------------------------------------------------------------------------------


def test_revoke_blocks_immediately(client, registry):
    created = create(client)
    node_secret = enroll(registry, created["key"])
    node_id = created["node"]["id"]
    response = client.post(f"/api/nodes/{node_id}/revoke")
    assert response.status_code == 200 and response.json()["status"] == "REVOKED"
    assert response.json()["key_expires_at"] is None
    assert refused(registry, hello(created["key"], "connect", node_secret)) == wire.CLOSE_REVOKED
    assert refused(registry, hello(created["key"])) == wire.CLOSE_REVOKED
    assert client.post(f"/api/nodes/{node_id}/revoke").status_code == 200  # twice is fine


def test_rekey_keeps_the_old_secret_until_the_new_enrollment_completes(client, registry):
    created = create(client)
    old_secret = enroll(registry, created["key"])
    node_id = created["node"]["id"]

    rekeyed = client.post(f"/api/nodes/{node_id}/rekey").json()
    assert rekeyed["node"]["key_expires_at"] is not None and rekeyed["key"] != created["key"]
    registry.authenticate(hello(created["key"], "connect", old_secret), "10.0.0.1")  # still valid
    assert refused(registry, hello(created["key"])) == wire.CLOSE_UNAUTHORIZED  # the old key is gone

    new_secret = enroll(registry, rekeyed["key"], ack=False)
    registry.authenticate(hello(created["key"], "connect", old_secret), "10.0.0.1")  # not acknowledged yet
    registry.acknowledge_enrollment(node_id)
    assert refused(registry, hello(created["key"], "connect", old_secret)) == wire.CLOSE_UNAUTHORIZED
    registry.authenticate(hello(created["key"], "connect", new_secret), "10.0.0.1")


def test_rekey_of_a_revoked_node_makes_it_pending_again(client, registry):
    created = create(client)
    node_id = created["node"]["id"]
    enroll(registry, created["key"])
    client.post(f"/api/nodes/{node_id}/revoke")
    rekeyed = client.post(f"/api/nodes/{node_id}/rekey").json()
    assert rekeyed["node"]["status"] == "PENDING"
    enroll(registry, rekeyed["key"])
    assert client.get(f"/api/nodes/{node_id}").json()["status"] == "OFFLINE"


# --- REST --------------------------------------------------------------------------------------------------------


def test_nodes_need_a_session(anonymous):
    for method, path in (
        ("get", "/api/nodes"),
        ("post", "/api/nodes"),
        ("get", "/api/nodes/node-x"),
        ("patch", "/api/nodes/node-x"),
        ("post", "/api/nodes/node-x/rekey"),
        ("post", "/api/nodes/node-x/revoke"),
        ("post", "/api/nodes/node-x/commands"),
    ):
        assert getattr(anonymous, method)(path).status_code == 401, path


def test_patch_and_detail_with_events(client, registry):
    created = create(client)
    node_id = created["node"]["id"]
    enroll(registry, created["key"])
    patched = client.patch(f"/api/nodes/{node_id}", json={"name": "Attic", "location": {"lat": 1.5, "lon": 2.5}})
    assert patched.status_code == 200
    assert (patched.json()["name"], patched.json()["location"]) == ("Attic", {"lat": 1.5, "lon": 2.5})
    detail = client.get(f"/api/nodes/{node_id}").json()
    assert detail["name"] == "Attic" and detail["events"][0]["kind"] == "enrolled"


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("post", "/api/nodes", {"name": "", "location": LOCATION}),
        ("post", "/api/nodes", {"name": "x", "location": {"lat": 91, "lon": 0}}),
        ("post", "/api/nodes", {"name": "x", "location": LOCATION, "preset": "nope"}),
        ("patch", "/api/nodes/{id}", {"preset": "nope"}),
        ("post", "/api/nodes/{id}/commands", {"type": "tune", "center_hz": 160_000_000, "rate": 1_000_000}),
        ("post", "/api/nodes/{id}/commands", {"type": "bogus"}),
        ("post", "/api/nodes/{id}/commands", {"type": "set_server", "url": "ftp://x"}),
    ],
)
def test_bad_bodies_are_422(client, method, path, body):
    node_id = create(client)["node"]["id"]
    assert getattr(client, method)(path.format(id=node_id), json=body).status_code == 422


def test_unknown_node_is_404_and_offline_node_refuses_commands(client):
    assert client.get("/api/nodes/node-nope1234").status_code == 404
    assert client.post("/api/nodes/node-nope1234/revoke").status_code == 404
    node_id = create(client)["node"]["id"]
    assert client.post(f"/api/nodes/{node_id}/commands", json={"type": "restart"}).status_code == 409


def test_no_secret_or_hash_is_returned_after_creation_or_stored_in_plain(client, registry, settings):
    created = create(client)
    node_id = created["node"]["id"]
    enrollment_secret = wire.NodeKey.decode(created["key"]).secret
    node_secret = enroll(registry, created["key"])
    rekeyed = client.post(f"/api/nodes/{node_id}/rekey").json()
    pending_secret = enroll(registry, rekeyed["key"], ack=False)
    secrets_ = [enrollment_secret, node_secret, pending_secret, wire.NodeKey.decode(rekeyed["key"]).secret]

    for path in ("/api/nodes", f"/api/nodes/{node_id}"):
        text = client.get(path).text
        assert not any(secret in text for secret in secrets_)
        body = client.get(path).json()
        assert not {"key", "secret", "node_secret"} & set(body if isinstance(body, dict) else body[0])
        assert "hash" not in " ".join(body if isinstance(body, dict) else body[0])
    for response in (
        client.patch(f"/api/nodes/{node_id}", json={"name": "x"}),
        client.post(f"/api/nodes/{node_id}/revoke"),
    ):
        assert not any(secret in response.text for secret in secrets_)

    dump = "\n".join(sqlite3.connect(settings.database_file).iterdump())
    assert not any(secret in dump for secret in secrets_)
    assert "node_credential" in dump
