"""Enrollment: trade the one-time node key for the permanent node secret and save it."""

import asyncio
from pathlib import Path

from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed, InvalidURI, WebSocketException

from ...live import node_protocol as wire
from . import AGENT_VERSION
from .config import ConfigDir, Credentials
from .uplink import HANDSHAKE_TIMEOUT_S


class EnrollError(Exception):
    pass


def read_key(key_or_file: str) -> str:
    """The argument of `sdrviz-node enroll`: the key itself, or the path of a file that holds it."""
    path = Path(key_or_file)
    return path.read_text().strip() if not key_or_file.startswith(wire.KEY_PREFIX) and path.is_file() else key_or_file


async def enroll(key_text: str, config: ConfigDir) -> Credentials:
    """Connect with the key, receive the node secret, save it, then confirm with `enrolled_ack`."""
    try:
        key = wire.NodeKey.decode(key_text)
    except ValueError as error:
        raise EnrollError(str(error)) from error
    hello = wire.Hello(agent_version=AGENT_VERSION, node=key.node, mode="enroll", secret=key.secret)
    try:
        async with connect(key.ws_url(), open_timeout=HANDSHAKE_TIMEOUT_S, ping_interval=None) as ws:
            await ws.send(wire.dump(hello))
            welcome = wire.parse_down(await asyncio.wait_for(ws.recv(), HANDSHAKE_TIMEOUT_S))
            if not isinstance(welcome, wire.Welcome) or not welcome.node_secret:
                raise EnrollError("the server did not hand out a node secret")
            credentials = Credentials(key.url, key.node, welcome.node_secret)
            config.save_credentials(credentials)  # saved before the ack: a lost ack is healed by the server
            await ws.send(wire.dump(wire.EnrolledAck()))
            await ws.close()
    except ConnectionClosed as closed:
        code, reason = (closed.rcvd.code, closed.rcvd.reason) if closed.rcvd else (None, "")
        raise EnrollError(f"the server refused the key ({code} {reason})".strip()) from closed
    except (OSError, TimeoutError, InvalidURI, WebSocketException) as error:
        raise EnrollError(f"could not reach {key.url}: {error}") from error
    return credentials
