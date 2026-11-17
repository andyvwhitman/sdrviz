"""Wire format of the node uplink (/ws/node). The contract is docs/node-protocol.md.

Text frames are JSON messages with a `type`; binary frames are the /ws/live frames of protocol.py with a
2-byte big-endian node number in front.
"""

import base64
import json
import struct
from dataclasses import dataclass
from typing import Annotated, Literal

from pydantic import BaseModel, Field, TypeAdapter

from . import protocol

PROTOCOL_VERSION = 1
KEY_PREFIX = "sdrviz-node1."
HEARTBEAT_S = 5

# WebSocket close codes (4000-4999 are application codes).
CLOSE_BAD_MESSAGE = 4400  # malformed or unexpected message; the node reconnects
CLOSE_UNAUTHORIZED = 4401  # unknown node, wrong secret: the node stops and waits for a new key
CLOSE_REVOKED = 4403  # the node was revoked in Settings: the node stops
CLOSE_HANDSHAKE_TIMEOUT = 4408  # no hello within 10 s
CLOSE_REPLACED = 4409  # the same node connected again; this connection is the old one
CLOSE_KEY_EXPIRED = 4410  # enrollment key expired or already used: the node stops
CLOSE_UNSUPPORTED = 4426  # protocol version not supported: the node stops until updated
CLOSE_RATE_LIMITED = 4429  # too many failed attempts from this address; retry with backoff
CLOSE_SERVER_ERROR = 4500  # server problem or restart; the node reconnects
STOP_CODES = {CLOSE_UNAUTHORIZED, CLOSE_REVOKED, CLOSE_KEY_EXPIRED, CLOSE_UNSUPPORTED}


class Message(BaseModel):
    """Base of every JSON message. Unknown fields are ignored so versions can grow."""


# --- both directions ---------------------------------------------------------------------------------------


class Ping(Message):
    type: Literal["ping"] = "ping"
    t: int  # sender's epoch milliseconds, echoed in the pong


class Pong(Message):
    type: Literal["pong"] = "pong"
    t: int  # copied from the ping
    peer_t: int  # the answering side's epoch milliseconds


# --- node to server ----------------------------------------------------------------------------------------


class Hello(Message):
    type: Literal["hello"] = "hello"
    protocol: int = PROTOCOL_VERSION
    agent_version: str
    node: str  # node id
    mode: Literal["enroll", "connect"]
    secret: str  # the enrollment secret (enroll) or the permanent node secret (connect)


class EnrolledAck(Message):
    """The node has saved its permanent secret; the server burns the enrollment secret."""

    type: Literal["enrolled_ack"] = "enrolled_ack"


class KeyUp(Message):
    type: Literal["key_up"] = "key_up"
    ch: int  # AAR channel number
    freq_hz: int
    tx_seq: int  # node-local transmission counter, also in the audio frames
    t: int  # node epoch milliseconds
    snr_db: float
    power_db: float


class KeyDown(Message):
    type: Literal["key_down"] = "key_down"
    ch: int
    tx_seq: int
    t: int


class ChannelLevel(BaseModel):
    ch: int
    power_db: float
    snr_db: float


class Levels(Message):
    """Every 100 ms while any channel is open: the levels of the open channels (the UI's level meters)."""

    type: Literal["levels"] = "levels"
    t: int
    open: list[ChannelLevel]


class Tune(BaseModel):
    center_hz: int
    rate: int
    gain_db: float | None  # None: automatic gain
    squelch_db: float


class Health(Message):
    type: Literal["health"] = "health"
    t: int
    cpu_pct: float  # all cores, 0-100
    temp_c: float | None
    rtl_tcp: Literal["connected", "connecting", "down"]
    dropped_blocks: int  # IQ blocks the node could not process in time, since start
    audio_age_ms: float  # average age of an audio packet when it was handed to the socket
    uptime_s: int
    channels: int  # channels being received
    tune: Tune


class CommandError(BaseModel):
    code: Literal["bad_value", "unsupported", "failed"]
    message: str


class Ack(Message):
    type: Literal["ack"] = "ack"
    id: str  # the command's id
    ok: bool
    error: CommandError | None = None


# --- server to node ----------------------------------------------------------------------------------------


class NodeConfig(BaseModel):
    channels: list[int]  # AAR channel numbers to receive (from the node's preset)


class WelcomeNode(BaseModel):
    id: str
    number: int  # prefixed to every binary frame
    name: str


class Welcome(Message):
    type: Literal["welcome"] = "welcome"
    protocol: int = PROTOCOL_VERSION
    node: WelcomeNode
    heartbeat_s: int = HEARTBEAT_S
    server_time: int  # epoch milliseconds
    config: NodeConfig
    node_secret: str | None = None  # only in answer to an enroll hello: save it, then send enrolled_ack


class Command(Message):
    id: str


class TuneCommand(Command):
    type: Literal["tune"] = "tune"
    center_hz: int
    rate: int


class GainCommand(Command):
    type: Literal["gain"] = "gain"
    gain_db: float | None  # None: automatic


class SquelchCommand(Command):
    type: Literal["squelch"] = "squelch"
    squelch_db: float


class ChannelsCommand(Command):
    type: Literal["channels"] = "channels"
    channels: list[int]


class RestartCommand(Command):
    type: Literal["restart"] = "restart"


class SetServerCommand(Command):
    type: Literal["set_server"] = "set_server"
    url: str  # https://host, the same form as in the node key


NodeToServer = Annotated[
    Ping | Pong | Hello | EnrolledAck | KeyUp | KeyDown | Levels | Health | Ack, Field(discriminator="type")
]
ServerToNode = Annotated[
    Ping
    | Pong
    | Welcome
    | TuneCommand
    | GainCommand
    | SquelchCommand
    | ChannelsCommand
    | RestartCommand
    | SetServerCommand,
    Field(discriminator="type"),
]
_UP = TypeAdapter(NodeToServer)
_DOWN = TypeAdapter(ServerToNode)


def parse_up(text: str) -> NodeToServer:
    """A JSON text frame from a node. Raises pydantic.ValidationError for anything unknown or malformed."""
    return _UP.validate_json(text)


def parse_down(text: str) -> ServerToNode:
    return _DOWN.validate_json(text)


def dump(message: Message) -> str:
    return message.model_dump_json()


# --- the node key ------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class NodeKey:
    url: str  # public base URL of the server, e.g. https://sdr.example.com
    node: str
    secret: str  # enrollment secret
    v: int = 1

    def encode(self) -> str:
        payload = json.dumps({"url": self.url, "node": self.node, "secret": self.secret, "v": self.v})
        return KEY_PREFIX + base64.urlsafe_b64encode(payload.encode()).rstrip(b"=").decode()

    @classmethod
    def decode(cls, key: str) -> "NodeKey":
        """Raises ValueError for anything that is not a version 1 node key."""
        key = key.strip()
        if not key.startswith(KEY_PREFIX):
            raise ValueError("not a node key")
        body = key[len(KEY_PREFIX) :]
        try:
            data = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
            return cls(url=data["url"], node=data["node"], secret=data["secret"], v=data["v"])
        except (ValueError, KeyError, TypeError) as error:
            raise ValueError("damaged node key") from error

    def ws_url(self) -> str:
        """wss://host/ws/node for an https URL (ws:// for http, used on a laptop)."""
        base = self.url.rstrip("/")
        scheme, _, rest = base.partition("://")
        return f"{'wss' if scheme == 'https' else 'ws'}://{rest}/ws/node"


# --- binary frames -----------------------------------------------------------------------------------------

_NODE = struct.Struct(">H")


def pack_frame(node_number: int, frame: bytes) -> bytes:
    """A /ws/live audio or spectrum frame with the node number in front."""
    return _NODE.pack(node_number) + frame


def unpack_frame(data: bytes) -> tuple[int, bytes]:
    """→ (node number, /ws/live frame). Raises ValueError when too short."""
    if len(data) <= _NODE.size:
        raise ValueError("frame too short")
    return _NODE.unpack_from(data)[0], data[_NODE.size :]


@dataclass(frozen=True)
class AudioFrame:
    codec: int
    ch: int
    flags: int
    tx_seq: int
    offset_ms: int
    payload: bytes

    @property
    def first(self) -> bool:
        return bool(self.flags & protocol.FLAG_FIRST)

    @property
    def last(self) -> bool:
        return bool(self.flags & protocol.FLAG_LAST)


@dataclass(frozen=True)
class SpectrumFrame:
    center_mhz: float
    span_mhz: float
    t_ms: int
    bins: bytes  # int8 dBFS, lowest frequency first


def parse_frame(frame: bytes) -> AudioFrame | SpectrumFrame:
    """Decode a /ws/live frame. Raises ValueError for an unknown kind or a short frame."""
    try:
        if frame[0] == protocol.KIND_AUDIO:
            _, codec, ch, flags, tx_seq, offset_ms = protocol.AUDIO_HEADER.unpack_from(frame)
            return AudioFrame(codec, ch, flags, tx_seq, offset_ms, frame[protocol.AUDIO_HEADER.size :])
        if frame[0] == protocol.KIND_SPECTRUM:
            _, _, count, center, span, t_ms = protocol.SPECTRUM_HEADER.unpack_from(frame)
            bins = frame[protocol.SPECTRUM_HEADER.size :]
            if len(bins) != count:
                raise ValueError("spectrum length does not match its header")
            return SpectrumFrame(center, span, t_ms, bins)
    except (IndexError, struct.error) as error:
        raise ValueError("frame too short") from error
    raise ValueError(f"unknown frame kind {frame[0]}")
