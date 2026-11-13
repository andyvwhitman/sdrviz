"""Single-user login: a signed session cookie set by POST /api/auth/login."""

import secrets
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, WebSocket

SESSION_COOKIE = "sdrviz_session"
MAX_ATTEMPTS = 5
WINDOW_S = 60.0


def password_matches(supplied: str, expected: str) -> bool:
    return secrets.compare_digest(supplied.encode(), expected.encode())


def require_session(request: Request) -> None:
    if not request.session.get("user"):
        raise HTTPException(status_code=401, detail="Not authenticated")


def websocket_authenticated(websocket: WebSocket) -> bool:
    return bool(websocket.session.get("user"))


class LoginLimiter:
    """At most MAX_ATTEMPTS login attempts per client per minute (in memory)."""

    def __init__(self) -> None:
        self._attempts: defaultdict[str, deque[float]] = defaultdict(deque)

    def allow(self, client: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        attempts = self._attempts[client]
        while attempts and now - attempts[0] > WINDOW_S:
            attempts.popleft()
        if len(attempts) >= MAX_ATTEMPTS:
            return False
        attempts.append(now)
        return True
