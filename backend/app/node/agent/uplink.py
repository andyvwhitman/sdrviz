"""The agent's WebSocket to the server (docs/node-protocol.md): hello, heartbeat, reconnect with backoff.

Audio is never buffered while offline: `send` drops everything when there is no connection, and the queue
of a connection is dropped with it. When the queue is full (a slow link) messages are dropped and counted.
"""

import asyncio
import contextlib
import logging
import random
import time
from dataclasses import dataclass, field
from typing import Protocol

from pydantic import ValidationError
from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed

from ...live import node_protocol as wire
from . import AGENT_VERSION
from .config import ConfigDir, Credentials

log = logging.getLogger(__name__)

QUEUE_SIZE = 300  # about 15 s of audio and spectrum for a few open channels
HANDSHAKE_TIMEOUT_S = 10.0
STABLE_AFTER_S = 30.0  # a connection this old resets the backoff
DEAD_AFTER_S = 3 * wire.HEARTBEAT_S
CREDENTIAL_POLL_S = 5.0


def backoff_delay(failures: int) -> float:
    """Seconds to wait after `failures` failed attempts in a row (0 for the first retry): 1, 2, 4 ... 60, jittered."""
    return min(60.0, 2.0**failures) * random.uniform(0.5, 1.0)


class Handler(Protocol):
    """What the uplink needs from the agent."""

    def on_online(self, welcome: wire.Welcome) -> None: ...
    def on_offline(self) -> None: ...
    def health(self) -> wire.Health: ...
    async def on_command(self, command: wire.Command) -> wire.Ack: ...
    async def enroll_key_files(self) -> None: ...


class StopRetrying(Exception):
    """The server said not to come back (revoked, wrong secret, key used up, protocol too old)."""


@dataclass
class Outgoing:
    data: str | bytes
    created: float = field(default_factory=time.monotonic)
    audio: bool = False


@dataclass
class UplinkStatus:
    state: str = "connecting"  # connecting | online | stopped
    detail: str = ""
    rtt_ms: float | None = None
    reconnects: int = 0
    dropped_messages: int = 0


class Uplink:
    def __init__(self, config: ConfigDir, handler: Handler):
        self.config = config
        self.handler = handler
        self.status = UplinkStatus()
        self.audio_age_ms = 0.0  # mean over the audio sent since the last health message
        self._queue: asyncio.Queue[Outgoing] | None = None  # only while connected
        self._age_sum, self._age_count = 0.0, 0
        self._reconnect = asyncio.Event()
        self._commands: set[asyncio.Task] = set()
        self._last_rx = time.monotonic()

    @property
    def connected(self) -> bool:
        return self._queue is not None

    def send(self, message: wire.Message) -> None:
        self._put(Outgoing(wire.dump(message)))

    def send_frame(self, frame: bytes, *, audio: bool = False) -> None:
        self._put(Outgoing(frame, audio=audio))

    def _put(self, item: Outgoing) -> None:
        if self._queue is None:
            return  # offline: drop
        try:
            self._queue.put_nowait(item)
        except asyncio.QueueFull:
            self.status.dropped_messages += 1

    def take_audio_age_ms(self) -> float:
        """Mean age of the audio sent since the last call (block read to socket write)."""
        if self._age_count:
            self.audio_age_ms = 1000 * self._age_sum / self._age_count
        self._age_sum, self._age_count = 0.0, 0
        return self.audio_age_ms

    def reconnect(self) -> None:
        """Drop the connection and connect again (with credentials as they are on disk now)."""
        self._reconnect.set()

    async def drain(self, timeout_s: float = 2.0) -> None:
        """Wait until what is queued has been written to the socket."""
        if self._queue is not None:
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._queue.join(), timeout_s)

    # --- the connection loop -------------------------------------------------------------------------------------

    async def run(self) -> None:
        failures = 0
        while True:
            credentials = self.config.credentials()
            if credentials is None:
                await self._wait_for_credentials(None)
                continue
            started = time.monotonic()
            self.status.state, self.status.detail = "connecting", ""
            try:
                await self._session(credentials)
            except StopRetrying as stop:
                self.status.state, self.status.detail = "stopped", str(stop)
                log.error("not retrying: %s", stop)
                await self._wait_for_credentials(credentials)
                failures = 0
                continue
            except (OSError, ConnectionClosed, TimeoutError, ValidationError, ValueError) as error:
                self.status.detail = str(error) or type(error).__name__
                log.warning("uplink to %s lost: %s", credentials.url, self.status.detail)
            finally:
                self._queue = None
                self.handler.on_offline()
            self.status.reconnects += 1
            failures = 0 if time.monotonic() - started >= STABLE_AFTER_S else failures + 1
            delay = backoff_delay(failures - 1) if failures else 0.5
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._reconnect.wait(), delay)
            self._reconnect.clear()

    async def _wait_for_credentials(self, current: Credentials | None) -> None:
        """Stopped or not enrolled: wait for a new key file or a changed node.json, without a restart."""
        while True:
            await self.handler.enroll_key_files()
            if self.config.credentials() not in (None, current):
                return
            await asyncio.sleep(CREDENTIAL_POLL_S)

    async def _session(self, credentials: Credentials) -> None:
        url = wire.NodeKey(credentials.url, credentials.node, credentials.secret).ws_url()
        async with connect(url, max_size=None, open_timeout=HANDSHAKE_TIMEOUT_S, ping_interval=None) as ws:
            try:
                welcome = await handshake(ws, credentials)
            except ConnectionClosed as closed:
                self._raise_if_final(closed)
                raise
            self._queue = asyncio.Queue(QUEUE_SIZE)
            self._reconnect.clear()
            self.status.state, self.status.detail = "online", ""
            log.info("online at %s as %s (node %d)", credentials.url, welcome.node.name, welcome.node.number)
            self.handler.on_online(welcome)
            tasks = [
                asyncio.create_task(self._write(ws)),
                asyncio.create_task(self._read(ws)),
                asyncio.create_task(self._heartbeat()),
                asyncio.create_task(self._reconnect.wait()),
            ]
            try:
                done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    task.result()
            except ConnectionClosed as closed:
                self._raise_if_final(closed)
                raise
            finally:
                for task in [*tasks, *self._commands]:
                    task.cancel()
                await asyncio.gather(*tasks, *self._commands, return_exceptions=True)

    @staticmethod
    def _raise_if_final(closed: ConnectionClosed) -> None:
        if closed.rcvd and closed.rcvd.code in wire.STOP_CODES:
            raise StopRetrying(f"server closed the connection: {closed.rcvd.code} {closed.rcvd.reason}".strip())

    async def _write(self, ws: ClientConnection) -> None:
        assert self._queue is not None
        while True:
            item = await self._queue.get()
            await ws.send(item.data)
            if item.audio:
                self._age_sum += time.monotonic() - item.created
                self._age_count += 1
            self._queue.task_done()

    async def _heartbeat(self) -> None:
        self._last_rx = time.monotonic()
        while True:
            self.send(wire.Ping(t=now_ms()))
            self.send(self.handler.health())
            await asyncio.sleep(wire.HEARTBEAT_S)
            if time.monotonic() - self._last_rx > DEAD_AFTER_S:
                raise TimeoutError(f"nothing from the server for {DEAD_AFTER_S:.0f} s")

    async def _read(self, ws: ClientConnection) -> None:
        async for raw in ws:
            self._last_rx = time.monotonic()
            if isinstance(raw, bytes):
                continue
            try:
                message = wire.parse_down(raw)
            except ValidationError:
                log.debug("ignoring a message of unknown type: %.80s", raw)
                continue
            if isinstance(message, wire.Ping):
                self.send(wire.Pong(t=message.t, peer_t=now_ms()))
            elif isinstance(message, wire.Pong):
                self.status.rtt_ms = float(now_ms() - message.t)
            elif isinstance(message, wire.Command):
                task = asyncio.create_task(self._answer(message))
                self._commands.add(task)
                task.add_done_callback(self._commands.discard)

    async def _answer(self, command: wire.Command) -> None:
        try:
            ack = await self.handler.on_command(command)
        except Exception as error:  # a command must never take the agent down
            log.exception("command %s failed", command.type)
            ack = wire.Ack(id=command.id, ok=False, error=wire.CommandError(code="failed", message=str(error)))
        self.send(ack)

    # --- trying a server address (set_server) --------------------------------------------------------------------

    @staticmethod
    async def try_server(url: str, credentials: Credentials) -> None:
        """Connect to `url` and say hello; returns when the server welcomes this node, raises otherwise."""
        target = Credentials(url, credentials.node, credentials.secret)
        async with connect(
            wire.NodeKey(url, target.node, target.secret).ws_url(),
            open_timeout=HANDSHAKE_TIMEOUT_S,
            ping_interval=None,
        ) as ws:
            await handshake(ws, target)


def now_ms() -> int:
    return int(time.time() * 1000)


async def handshake(ws: ClientConnection, credentials: Credentials, mode: str = "connect") -> wire.Welcome:
    """hello → welcome. A closed socket raises ConnectionClosed; anything but a welcome raises ValueError."""
    hello = wire.Hello(agent_version=AGENT_VERSION, node=credentials.node, mode=mode, secret=credentials.secret)
    await ws.send(wire.dump(hello))
    answer = wire.parse_down(await asyncio.wait_for(ws.recv(), HANDSHAKE_TIMEOUT_S))
    if not isinstance(answer, wire.Welcome):
        raise ValueError(f"expected welcome, got {answer.type}")
    return answer
