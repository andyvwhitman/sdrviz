"""Login: a signed session cookie set by POST /api/auth/login, with two roles (viewer and admin) and a lockout."""

import secrets
import time
from collections import defaultdict, deque
from typing import Annotated, Literal

from fastapi import Depends, HTTPException, Request, WebSocket

SESSION_COOKIE = "sdrviz_session"
Role = Literal["viewer", "admin"]
ROLES = ("viewer", "admin")

MAX_FAILURES = 5  # wrong passwords per WINDOW_S before 429
WINDOW_S = 60.0
LOCK_FAILURES = 15  # wrong passwords per LOCK_WINDOW_S before 423
LOCK_WINDOW_S = 15 * 60.0
LOCKOUT_S = 15 * 60.0


def password_matches(supplied: str, expected: str) -> bool:
    return secrets.compare_digest(supplied.encode(), expected.encode())


def role_for_password(supplied: str, password: str, admin_password: str | None) -> Role | None:
    """The role a password logs in as. Without an admin password the one password is the admin password."""
    is_viewer = password_matches(supplied, password)  # both compared, so timing does not tell which one exists
    is_admin = bool(admin_password) and password_matches(supplied, admin_password)
    if is_admin or (is_viewer and not admin_password):
        return "admin"
    return "viewer" if is_viewer else None


def current_role(request: Request) -> Role | None:
    role = request.session.get("user")  # sessions from before the roles hold "admin"
    return role if role in ROLES else None


def require_session(request: Request) -> None:
    if current_role(request) is None:
        raise HTTPException(status_code=401, detail="Not authenticated")


def require_admin(request: Request) -> None:
    role = current_role(request)
    if role is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


ADMIN = Depends(require_admin)
CurrentRole = Annotated[Role | None, Depends(current_role)]


def websocket_authenticated(websocket: WebSocket) -> bool:
    return websocket.session.get("user") in ROLES


class LoginLimiter:
    """Counts wrong passwords per client (in memory). MAX_FAILURES in WINDOW_S: blocked for the rest of the window
    (HTTP 429). LOCK_FAILURES in LOCK_WINDOW_S: locked out for LOCKOUT_S (HTTP 423). Also used for failed node
    authentications."""

    def __init__(self) -> None:
        self._failures: defaultdict[str, deque[float]] = defaultdict(deque)
        self._locked_until: dict[str, float] = {}

    def _recent(self, client: str, now: float) -> deque[float]:
        failures = self._failures.get(client, deque())
        while failures and now - failures[0] > LOCK_WINDOW_S:
            failures.popleft()
        if not failures:
            self._failures.pop(client, None)  # nothing to remember about this client any more
        return failures

    def locked_for(self, client: str, now: float | None = None) -> float:
        """Seconds of lockout left, 0 when not locked."""
        now = time.monotonic() if now is None else now
        until = self._locked_until.get(client, 0.0)
        if until <= now:
            self._locked_until.pop(client, None)
            return 0.0
        return until - now

    def retry_after(self, client: str, now: float | None = None) -> float:
        """Seconds until this client may try again (0 when it may now)."""
        now = time.monotonic() if now is None else now
        if locked := self.locked_for(client, now):
            return locked
        in_window = [t for t in self._recent(client, now) if now - t <= WINDOW_S]
        if len(in_window) < MAX_FAILURES:
            return 0.0
        return in_window[-MAX_FAILURES] + WINDOW_S - now

    def blocked(self, client: str, now: float | None = None) -> bool:
        return self.retry_after(client, now) > 0

    def record(self, client: str, now: float | None = None) -> None:
        """One wrong password."""
        now = time.monotonic() if now is None else now
        failures = self._recent(client, now)
        failures.append(now)
        self._failures[client] = failures
        if len(failures) >= LOCK_FAILURES:
            self._locked_until[client] = now + LOCKOUT_S
            failures.clear()

    def clear(self, client: str) -> None:
        self._failures.pop(client, None)
