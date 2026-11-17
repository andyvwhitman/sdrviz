"""A real uvicorn server in a thread, for tests that need real sockets (the agent talks to it)."""

import threading
import time

import uvicorn

from app.config import Settings
from app.main import create_app


class LiveServer:
    def __init__(self, settings: Settings, port: int):
        self.port = port
        self.url = f"http://127.0.0.1:{port}"
        self.app = create_app(settings.model_copy(update={"public_url": self.url}))
        self._server = uvicorn.Server(uvicorn.Config(self.app, host="127.0.0.1", port=port, log_level="warning"))
        self._thread = threading.Thread(target=self._server.run, daemon=True)

    def start(self) -> "LiveServer":
        self._thread.start()
        deadline = time.monotonic() + 15
        while not self._server.started:
            assert time.monotonic() < deadline and self._thread.is_alive(), "server did not start"
            time.sleep(0.02)
        return self

    def stop(self) -> None:
        self._server.should_exit = True
        self._thread.join(15)
