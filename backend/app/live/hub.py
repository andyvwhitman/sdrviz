"""Fan-out of live messages to the connected WebSocket clients."""

import asyncio
import contextlib
from dataclasses import dataclass, field

QUEUE_SIZE = 512


@dataclass
class Hold:
    """A client holding a channel to listen to it (see live/listen.py)."""

    expires: float  # monotonic
    state: str = "tuning"  # tuning: the node has not confirmed the channel yet | listening


@dataclass(eq=False)
class Client:
    """One connection: an outbound queue plus what it asked to receive."""

    queue: asyncio.Queue[str | bytes | None] = field(default_factory=lambda: asyncio.Queue(QUEUE_SIZE))  # None: close
    audio: set[str] = field(default_factory=set)  # frequency ids
    watch: str | None = None  # feed id for spectrum frames
    listen_feed: str | None = None  # the node this connection listens to (its snapshots); None: the default
    holds: dict[tuple[str, int], Hold] = field(default_factory=dict)  # (feed id, AAR channel) held to listen


class Hub:
    def __init__(self) -> None:
        self.clients: set[Client] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def register(self) -> Client:
        client = Client()
        self.clients.add(client)
        return client

    def unregister(self, client: Client) -> None:
        self.clients.discard(client)

    # Publishing is safe from the event loop and from worker threads (sync route handlers).

    def broadcast(self, text: str) -> None:
        self._post(lambda: self._deliver(self.clients, text))

    def send_audio(self, channel_id: str, frame: bytes) -> None:
        self._post(lambda: self._deliver([c for c in self.clients if channel_id in c.audio], frame))

    def send_listen(self, feed_id: str, aar_channel: int, frame: bytes, skip_channel_id: str = "") -> None:
        """Audio of a held channel, to the clients holding it (not those that already get it as `skip_channel_id`)."""
        key = (feed_id, aar_channel)
        self._post(
            lambda: self._deliver([c for c in self.clients if key in c.holds and skip_channel_id not in c.audio], frame)
        )

    def send_to(self, client: Client, text: str) -> None:
        self._post(lambda: self._deliver([client], text))

    def send_spectrum(self, feed_id: str, frame: bytes) -> None:
        self._post(lambda: self._deliver([c for c in self.clients if c.watch == feed_id], frame))

    def close_all(self) -> None:
        """Ask every connection to close (server restart)."""
        self._post(lambda: self._deliver(self.clients, None))

    def audio_subscribed(self, channel_id: str) -> bool:
        return any(channel_id in c.audio for c in self.clients)

    def watched_feeds(self) -> set[str]:
        return {c.watch for c in self.clients if c.watch}

    def _post(self, deliver) -> None:
        try:
            on_loop = asyncio.get_running_loop() is self._loop
        except RuntimeError:
            on_loop = False
        if on_loop or self._loop is None:
            deliver()
        else:
            self._loop.call_soon_threadsafe(deliver)

    @staticmethod
    def _deliver(clients, payload: str | bytes | None) -> None:
        for client in list(clients):
            # A client that cannot keep up loses frames rather than stalling the others.
            with contextlib.suppress(asyncio.QueueFull):
                client.queue.put_nowait(payload)
