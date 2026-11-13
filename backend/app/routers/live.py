"""The /ws/live WebSocket: hello, snapshot, then everything the replay engine publishes."""

import asyncio
import json
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..auth import websocket_authenticated
from ..live import protocol
from ..live.hub import Client
from ..sim.timefmt import hms

router = APIRouter()
log = logging.getLogger(__name__)

CLOSE_UNAUTHENTICATED = 4401
CLOSE_RESTART = 4000


@router.websocket("/ws/live")
async def live(websocket: WebSocket) -> None:
    rt = websocket.app.state.rt
    await websocket.accept()
    if not websocket_authenticated(websocket):
        await websocket.close(code=CLOSE_UNAUTHENTICATED)  # accepted first so the client sees the code
        return
    client = rt.hub.register()
    sender = asyncio.create_task(_send_loop(websocket, client))
    try:
        client.queue.put_nowait(
            protocol.message(
                "hello",
                protocol=protocol.PROTOCOL_VERSION,
                sim={
                    "scenario": rt.scenario.name if rt.scenario else None,
                    "speed": rt.clock.speed,
                    "clock_s": rt.clock.now(),
                    "clock": hms(rt.clock.now()),
                },
                server_time=datetime.now(UTC).isoformat(timespec="milliseconds"),
            )
        )
        client.queue.put_nowait(protocol.message("snapshot", state=rt.live_state()))
        async for raw in websocket.iter_text():
            _handle(rt, client, raw)
    except WebSocketDisconnect:
        pass
    finally:
        sender.cancel()
        rt.hub.unregister(client)


async def _send_loop(websocket: WebSocket, client: Client) -> None:
    try:
        while True:
            item = await client.queue.get()
            if item is None:
                await websocket.close(code=CLOSE_RESTART)
                return
            if isinstance(item, bytes):
                await websocket.send_bytes(item)
            else:
                await websocket.send_text(item)
    except (WebSocketDisconnect, RuntimeError):
        pass


def _handle(rt, client: Client, raw: str) -> None:
    """Client ops: {op:"audio", channels:[...]}, {op:"watch", feed_id}, {op:"ping"}."""
    try:
        msg = json.loads(raw)
        op = msg["op"]
    except (ValueError, KeyError, TypeError):
        return
    if op == "audio":
        client.audio = {c for c in msg.get("channels", []) if c in rt.world.freqs}
    elif op == "watch":
        feed_id = msg.get("feed_id")
        client.watch = feed_id if feed_id in rt.world.feeds else None
    elif op == "ping":
        client.queue.put_nowait(protocol.message("pong", t=rt.clock.now()))
