"""Origin check for state-changing requests and WebSocket upgrades (B-3).

A browser always sends `Origin` on a POST, PUT, PATCH, DELETE or WebSocket handshake. When it names another host than
the one that was asked (or the site's public address), the request comes from another web page and is refused.
Requests without an Origin (curl, the node agent) are not from a browser page and pass; they still need a login.
"""

import json
from urllib.parse import urlsplit

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class OriginCheck:
    def __init__(self, app: ASGIApp, public_url: str = ""):
        self.app = app
        self.public_host = urlsplit(public_url).netloc.lower()

    def allowed(self, headers: Headers) -> bool:
        origin = headers.get("origin")
        if origin is None:
            return True
        host = urlsplit(origin).netloc.lower()
        return bool(host) and host in {headers.get("host", "").lower(), self.public_host}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        kind = scope["type"]
        checked = kind == "websocket" or (kind == "http" and scope["method"] not in SAFE_METHODS)
        if not checked or self.allowed(Headers(scope=scope)):
            await self.app(scope, receive, send)
        elif kind == "websocket":
            await send({"type": "websocket.close", "code": 1008})
        else:
            body = json.dumps({"detail": "Cross-origin request refused"}).encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": 403,
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
                }
            )
            await send({"type": "http.response.body", "body": body})
