"""B-1, B-2, B-3: lockout, the viewer and admin roles, production settings, Origin checks."""

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app import auth
from app.auth import LoginLimiter
from app.config import Settings
from app.main import create_app
from app.routers.system import VERSION

from .conftest import PASSWORD

ADMIN_PASSWORD = "admin-password-1"


@pytest.fixture
def two_roles(settings):
    return settings.model_copy(update={"admin_password": ADMIN_PASSWORD})


def logged_in(settings, password) -> TestClient:
    test_client = TestClient(create_app(settings))
    test_client.__enter__()
    assert test_client.post("/api/auth/login", json={"password": password}).status_code == 204
    return test_client


@pytest.fixture
def viewer(two_roles):
    with logged_in(two_roles, PASSWORD) as test_client:
        yield test_client


@pytest.fixture
def admin(two_roles):
    with logged_in(two_roles, ADMIN_PASSWORD) as test_client:
        yield test_client


# --- login, roles, lockout ---------------------------------------------------------------------------------


def test_each_password_gets_its_role(viewer, admin):
    info = viewer.get("/api/auth/session").json()
    assert info | {"commit": None} == {
        "authenticated": True, "sim": True, "role": "viewer", "version": VERSION, "commit": None,
    }  # fmt: skip
    assert admin.get("/api/auth/session").json()["role"] == "admin"


def test_without_an_admin_password_the_one_password_is_admin(client):
    assert client.get("/api/auth/session").json()["role"] == "admin"


def test_overlong_password_is_refused_before_it_is_compared(anonymous):
    assert anonymous.post("/api/auth/login", json={"password": "x" * 257}).status_code == 422


def test_rate_limit_answers_429_with_retry_after_even_for_the_right_password(anonymous):
    for _ in range(5):
        assert anonymous.post("/api/auth/login", json={"password": "x"}).status_code == 401
    blocked = anonymous.post("/api/auth/login", json={"password": PASSWORD})
    assert blocked.status_code == 429 and 1 <= int(blocked.headers["retry-after"]) <= 60


def test_right_passwords_never_count_and_clear_earlier_failures(anonymous):
    for _ in range(4):
        anonymous.post("/api/auth/login", json={"password": "x"})
    for _ in range(10):
        assert anonymous.post("/api/auth/login", json={"password": PASSWORD}).status_code == 204
    assert anonymous.post("/api/auth/login", json={"password": "x"}).status_code == 401


def test_limiter_budgets_are_per_client_and_lock_after_repeated_failures():
    limiter = LoginLimiter()
    for i in range(5):
        limiter.record("a", now=i)
    assert limiter.blocked("a", now=10) and not limiter.blocked("b", now=10)
    assert 49 < limiter.retry_after("a", now=10) <= 60
    assert not limiter.blocked("a", now=70)  # the window passed
    for i in range(10):  # 15 wrong passwords in 15 minutes
        limiter.record("a", now=100 + i * 60)
    assert limiter.locked_for("a", now=700) > 0
    assert limiter.locked_for("a", now=700 + auth.LOCKOUT_S + 1) == 0
    assert "b" not in limiter._failures


def test_lockout_answers_423_with_retry_after(anonymous):
    limiter = anonymous.app.state.limiter
    for _ in range(auth.LOCK_FAILURES):
        limiter.record("testclient")
    locked = anonymous.post("/api/auth/login", json={"password": PASSWORD})
    assert locked.status_code == 423 and int(locked.headers["retry-after"]) > 600


# --- routes by role ------------------------------------------------------------------------------------------


ADMIN_ONLY = [
    ("get", "/api/nodes", None),
    ("post", "/api/nodes", {"name": "N", "location": {"lat": 38.9, "lon": -77.0}}),
    ("patch", "/api/nodes/node-x", {"name": "M"}),
    ("post", "/api/nodes/node-x/rekey", None),
    ("post", "/api/nodes/node-x/revoke", None),
    ("post", "/api/nodes/node-x/commands", {"type": "restart"}),
    ("get", "/api/transit/sources", None),
    ("post", "/api/transit/sources", {"id": "x", "name": "X", "agency": "X"}),
    ("put", "/api/transit/sources/x", {"id": "x", "name": "X", "agency": "X"}),
    ("delete", "/api/transit/sources/x", None),
    ("post", "/api/transit/sources/x/refresh", None),
    ("get", "/api/radio/settings", None),
    ("put", "/api/radio/settings", {}),
    ("post", "/api/feeds", {}),
    ("put", "/api/feeds/feed-x", {}),
    ("delete", "/api/feeds/feed-x", None),
    ("post", "/api/frequencies", {}),
    ("put", "/api/frequencies/x", {}),
    ("delete", "/api/frequencies/x", None),
    ("post", "/api/sim/jump", {"clock": "10:00:00"}),
]

VIEWER_OK = [
    "/api/system",
    "/api/live/state",
    "/api/frequencies",
    "/api/feeds",
    "/api/radio",
    "/api/transit/vehicles",
    "/api/trains",
]


def call(client, method, path, body):
    return getattr(client, method)(path, **({"json": body} if body is not None else {}))


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ONLY)
def test_viewer_gets_403_on_admin_routes(viewer, method, path, body):
    assert call(viewer, method, path, body).status_code == 403


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ONLY)
def test_admin_routes_are_not_refused_to_an_admin(admin, method, path, body):
    assert call(admin, method, path, body).status_code not in (401, 403)


@pytest.mark.parametrize("path", VIEWER_OK)
def test_viewer_reads(viewer, path):
    assert viewer.get(path).status_code == 200


def test_viewer_can_ack(viewer):
    assert viewer.post("/api/feeds/feed-x/ack", json={"reason": "seen"}).status_code != 403


def test_old_admin_cookie_still_works(client):
    assert client.get("/api/nodes").status_code == 200


# --- B-1: production settings ---------------------------------------------------------------------------------


def production(**over) -> Settings:
    values = {"public_url": "https://dispatch.example.org", "password": "a-long-viewer-pass", "secret": "s" * 43}
    return Settings(**{**values, **over})


def test_production_with_real_settings_starts():
    assert production().production_problems() == []
    assert production(admin_password="another-long-pass").production_problems() == []
    assert production(admin_password="").production_problems() == []  # compose passes an unset variable as ""


@pytest.mark.parametrize(
    "over",
    [
        {"password": "sdrviz"},
        {"password": "short"},
        {"secret": "dev-secret-change-me"},
        {"secret": "too-short"},
        {"admin_password": "change-me"},
        {"admin_password": "a-long-viewer-pass"},
    ],
)
def test_production_refuses_weak_settings(over, tmp_path):
    settings = production(**over, db_path=tmp_path / "x.sqlite")
    with pytest.raises(RuntimeError, match="refusing to start"):
        create_app(settings)


def test_dev_settings_are_not_checked(settings):
    create_app(settings)  # http://localhost with the test password: fine


# --- B-3: Secure cookie and Origin ---------------------------------------------------------------------------


def test_cookie_is_secure_only_on_https(anonymous, settings):
    plain = anonymous.post("/api/auth/login", json={"password": PASSWORD})
    assert "secure" not in plain.headers["set-cookie"].lower()
    https = settings.model_copy(update={"public_url": "https://testserver", "secret": "s" * 43})
    with TestClient(create_app(https), base_url="https://testserver") as secure:
        response = secure.post("/api/auth/login", json={"password": PASSWORD})
        assert "secure" in response.headers["set-cookie"].lower()


def test_cross_origin_writes_and_sockets_are_refused(client):
    foreign = {"Origin": "https://evil.example"}
    assert client.put("/api/frequencies/x/assignments/feed-lnd", json={}, headers=foreign).status_code == 403
    assert client.post("/api/auth/logout", headers=foreign).status_code == 403
    assert client.get("/api/system", headers=foreign).status_code == 200  # reads are not state-changing
    with pytest.raises(WebSocketDisconnect), client.websocket_connect("/ws/live", headers=foreign):
        pass


def test_same_origin_and_no_origin_pass(client):
    login = {"password": PASSWORD}
    assert client.post("/api/auth/login", json=login, headers={"Origin": "http://testserver"}).status_code == 204
    assert client.post("/api/auth/login", json=login).status_code == 204  # no Origin: curl, the node agent
    with client.websocket_connect("/ws/live", headers={"Origin": "http://testserver"}) as live:
        assert live.receive_json()["type"] == "hello"


def test_public_url_host_counts_as_the_same_origin(settings):
    behind_proxy = settings.model_copy(update={"public_url": "http://dispatch.example"})
    with TestClient(create_app(behind_proxy)) as test_client:
        test_client.post("/api/auth/login", json={"password": PASSWORD})
        ok = test_client.post("/api/auth/login", json={"password": PASSWORD}, headers={"Origin": "http://dispatch.example"})
        assert ok.status_code == 204


def test_session_reports_the_server_mode(settings):
    for sim in (True, False):
        with logged_in(settings.model_copy(update={"sim": sim}), PASSWORD) as test_client:
            assert test_client.get("/api/auth/session").json()["sim"] is sim


def test_prefs_routes_are_gone(viewer):
    assert viewer.get("/api/prefs").status_code == 404
    assert viewer.put("/api/prefs", json={"muted": ["x"]}).status_code in (404, 405)
