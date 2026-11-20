"""The node registry: create nodes, issue and check enrollment keys and node secrets (docs/node-protocol.md).

Secrets are 32 random bytes in base64url. Only their SHA-256 hashes reach the database. A node key carries
the enrollment secret; enrolling exchanges it for a permanent node secret that the node keeps.
"""

import hashlib
import hmac
import secrets
import string
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlmodel import Session, col, func, select

from ..auth import LoginLimiter
from ..db import open_session
from ..live import node_protocol as wire
from ..models import Assignment, Feed, Frequency
from .models import Node, NodeCredential, NodeEvent
from .schemas import CommandIn, CommandResult, Location, NodeDetail, NodeEventOut, NodeOut

ENROLLMENT_TTL = timedelta(hours=24)
ASSIGNED_PRESET = "assigned"  # the AAR channels of the node's enabled assignments, plus held listens
PRESETS = {"aar": list(range(7, 98))}  # fixed presets: name → AAR channel numbers (the whole band)
PRESET_NAMES = (ASSIGNED_PRESET, *PRESETS)
DEFAULT_PRESET = ASSIGNED_PRESET
EVENTS_SHOWN = 50
ID_ALPHABET = string.ascii_lowercase + string.digits


class NodeNotFound(Exception):
    pass


class NodeOffline(Exception):
    pass


class AuthError(Exception):
    """A node's hello was refused; `close_code` is the WebSocket close code to answer with."""

    def __init__(self, close_code: int, reason: str):
        super().__init__(reason)
        self.close_code, self.reason = close_code, reason


@dataclass
class NodeLive:
    """What only the running server knows about a node; BE-5 keeps it up to date."""

    online: bool = False
    link_quality: int | None = None
    lag_ms: int | None = None
    health: dict | None = None
    feed_id: str | None = None  # the node's feed, set once the node is known


@dataclass(frozen=True)
class NodeFeedStatus:
    """What the live feed card shows of a node: its real state and the telemetry its health reports."""

    state: str  # ok | stale | offline, as the feed states
    label: str
    in_state_s: float
    telemetry: dict[str, float | None]


# Node health key -> feed telemetry key. The one place the two vocabularies meet. The node reports the Pi's
# temperature (not the dongle's), so `device_temp_c` is left out: the card shows "not reported", not a made-up value.
HEALTH_TO_TELEMETRY = {"cpu_pct": "host_cpu_pct", "temp_c": "host_temp_c", "dropped_blocks": "device_drops"}


def feed_telemetry(health: dict | None) -> dict[str, float | None]:
    """The feed's telemetry from a node's health; every key blank when there is no health or the node reports None."""
    health = health or {}
    return {telemetry: health.get(key) for key, telemetry in HEALTH_TO_TELEMETRY.items()}


def feed_state(online: bool, health: dict | None) -> tuple[str, str]:
    """The feed state and label of a node: the node's own report, not the replay's."""
    if not online:
        return "offline", "OFFLINE"
    rtl_tcp = (health or {}).get("rtl_tcp")
    if rtl_tcp in (None, "connected"):  # no health yet: the link is up and nothing is wrong that we know of
        return "ok", ""
    return "stale", f"STALE · RTL_TCP {rtl_tcp}".upper()


@dataclass(frozen=True)
class Authenticated:
    node: Node
    channels: list[int]
    node_secret: str | None  # only for an enrollment: send it in `welcome`, wait for enrolled_ack


def utcnow() -> datetime:
    return datetime.now(UTC)


def aware(moment: datetime) -> datetime:
    """SQLite may give back a time without its zone; everything stored is UTC."""
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def iso(moment: datetime | None) -> str | None:
    return aware(moment).isoformat(timespec="seconds") if moment else None


def node_feed_id(number: int) -> str:
    return f"node-{number}"


def _number(feed_id: str) -> int:
    return int(feed_id.removeprefix("node-"))


def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def matches(secret: str, stored_hash: str | None) -> bool:
    return stored_hash is not None and hmac.compare_digest(hash_secret(secret), stored_hash)


class NodeRegistry:
    def __init__(self, engine: Engine, public_url: str, limiter: LoginLimiter | None = None):
        self.engine = engine
        self.public_url = public_url
        self.limiter = limiter or LoginLimiter()  # failed authentications per client address
        self.live: dict[str, NodeLive] = {}
        self._feed_since: dict[str, tuple[str, float]] = {}  # feed id -> (state, monotonic time it began)
        # BE-5 sets this to send a command to a connected node and wait for its ack.
        self.command_sender: Callable[[str, CommandIn], Awaitable[CommandResult]] | None = None
        # Set by the runtime: called after a change that adds, changes or removes a node's feed row.
        self.on_feeds_changed: Callable[[], None] = lambda: None
        # Set by the runtime: the AAR channels clients hold to listen to on a feed (see live/hub.py).
        self.held_channels: Callable[[str], set[int]] = lambda feed_id: set()

    def migrate(self) -> None:
        """Nodes on the retired `banks` preset decode their assignments now."""
        with self.engine.begin() as conn:
            conn.execute(text("UPDATE node SET preset = :new WHERE preset = 'banks'"), {"new": ASSIGNED_PRESET})

    # --- reading ---------------------------------------------------------------------------------------------

    def list(self) -> list[NodeOut]:
        with open_session(self.engine) as session:
            return [self._view(session, node) for node in session.exec(select(Node).order_by(Node.number))]

    def get(self, node_id: str) -> NodeDetail:
        with open_session(self.engine) as session:
            node = self._node(session, node_id)
            events = session.exec(
                select(NodeEvent)
                .where(NodeEvent.node_id == node_id)
                .order_by(col(NodeEvent.id).desc())
                .limit(EVENTS_SHOWN)
            )
            shown = [NodeEventOut(t=iso(e.t), kind=e.kind, detail=e.detail) for e in events]
            return NodeDetail(**self._view(session, node).model_dump(), events=shown)

    def channels_for(self, node: Node | NodeOut) -> list[int]:
        """The AAR channels `node` should decode: the whole band, or its enabled assignments and held listens."""
        if node.preset in PRESETS:
            return PRESETS[node.preset]
        feed_id = node_feed_id(node.number)
        return sorted(self.assigned_channels(feed_id) | self.held_channels(feed_id))

    def assigned_channels(self, feed_id: str) -> set[int]:
        """The AAR channels of the frequencies enabled on a feed."""
        with open_session(self.engine) as session:
            query = (
                select(Frequency.aar_channel)
                .join(Assignment, col(Assignment.frequency_id) == col(Frequency.id))
                .where(Assignment.feed_id == feed_id, Assignment.enabled)
            )
            return {channel for channel in session.exec(query) if channel}

    def feeds(self, freqs: dict[str, Frequency], enabled: dict[str, list[str]]) -> list[Feed]:
        """Enrolled nodes as feeds (driver sdrviz-agent) that hear their enabled frequencies."""
        with open_session(self.engine) as session:
            nodes = session.exec(select(Node).where(Node.status == "OFFLINE").order_by(Node.number)).all()
        return [
            Feed(
                id=node_feed_id(node.number),
                name=node.name,
                short=node.name.split()[0],
                site="remote node",
                lat=node.lat,
                lon=node.lon,
                coverage_radius_km=20,
                hears=enabled.get(node_feed_id(node.number), []),
                driver="sdrviz-agent",
                sample_rate_msps=1.536,
            )
            for node in nodes
        ]

    def node_for_feed(self, feed_id: str) -> NodeOut | None:
        return next((node for node in self.list() if node.feed_id == feed_id), None)

    def online_feed_ids(self) -> list[str]:
        """The feeds of the nodes that are connected now, by node number."""
        return sorted((live.feed_id for live in self.live.values() if live.online and live.feed_id), key=_number)

    def feed_status(self, feed_id: str) -> NodeFeedStatus | None:
        """The live state and telemetry of node feed `feed_id`; None for a feed that is not a node."""
        if not feed_id.startswith("node-"):
            return None
        live = next((live for live in self.live.values() if live.feed_id == feed_id), NodeLive())
        state, label = feed_state(live.online, live.health)
        key = f"{state}/{label}"
        now = time.monotonic()
        began_key, began = self._feed_since.get(feed_id, (key, now))
        if began_key != key:
            began = now
        self._feed_since[feed_id] = (key, began)
        telemetry = feed_telemetry(live.health if live.online else None)
        return NodeFeedStatus(state, label, now - began, telemetry)

    # --- Settings actions --------------------------------------------------------------------------------------

    def create(self, name: str, location: Location, preset: str | None = None) -> tuple[NodeOut, str]:
        preset = self._preset(preset)
        with open_session(self.engine) as session:
            number = (session.exec(select(func.max(Node.number))).one() or 0) + 1
            if number > 0xFFFF:
                raise ValueError("no node numbers left")
            node_id = self._new_id(session)
            node = Node(id=node_id, number=number, name=name, lat=location.lat, lon=location.lon, preset=preset)
            node.created_at = utcnow()
            credential = NodeCredential(node_id=node_id)
            session.add(node)
            session.add(credential)
            key = self._issue_enrollment(credential, node)
            session.commit()
            return self._view(session, node), key

    def update(self, node_id: str, name: str | None, location: Location | None, preset: str | None) -> NodeOut:
        with open_session(self.engine) as session:
            node = self._node(session, node_id)
            if preset is not None:
                node.preset = self._preset(preset)
            if name is not None:
                node.name = name
            if location is not None:
                node.lat, node.lon = location.lat, location.lon
            session.add(node)
            session.commit()
            view = self._view(session, node)
        if node.status == "OFFLINE":
            self.on_feeds_changed()
        return view

    def rekey(self, node_id: str) -> tuple[NodeOut, str]:
        """A new enrollment key. The node's current secret keeps working until the new enrollment completes."""
        with open_session(self.engine) as session:
            node = self._node(session, node_id)
            credential = session.get(NodeCredential, node_id)
            if credential.revoked_at:  # re-keying a revoked node brings it back as a new, pending one
                credential.revoked_at = None
                node.status = "PENDING"
            key = self._issue_enrollment(credential, node)
            self._event(session, node_id, "rekeyed", "new node key issued")
            session.add_all([node, credential])
            session.commit()
            return self._view(session, node), key

    def revoke(self, node_id: str) -> NodeOut:
        """All secrets are deleted at once, so the next hello fails. (Closing a live socket is BE-5's.)"""
        with open_session(self.engine) as session:
            node = self._node(session, node_id)
            credential = session.get(NodeCredential, node_id)
            if not credential.revoked_at:
                credential.revoked_at = utcnow()
                credential.enrollment_hash = credential.enrollment_expires_at = None
                credential.node_secret_hash = credential.pending_secret_hash = None
                node.status = "REVOKED"
                self._event(session, node_id, "revoked", "revoked in Settings")
                session.add_all([node, credential])
                session.commit()
                changed = True
            else:
                changed = False
            view = self._view(session, node)
        if changed:
            self.on_feeds_changed()
        return view

    async def send_command(self, node_id: str, command: CommandIn) -> CommandResult:
        if not self.command_sender or not self.live.get(node_id, NodeLive()).online:
            raise NodeOffline(node_id)
        return await self.command_sender(node_id, command)

    # --- the node's side: /ws/node (BE-5) -----------------------------------------------------------------------

    def authenticate(self, hello: wire.Hello, client: str, now: datetime | None = None) -> Authenticated:
        """Check a hello. Raises AuthError with the close code to answer with. Wrong secrets count against `client`."""
        now = now or utcnow()
        if hello.protocol != wire.PROTOCOL_VERSION:
            raise AuthError(wire.CLOSE_UNSUPPORTED, f"protocol {hello.protocol} is not supported")
        if self.limiter.blocked(client):
            raise AuthError(wire.CLOSE_RATE_LIMITED, "too many failed attempts")
        with open_session(self.engine) as session:
            node = session.get(Node, hello.node)
            credential = session.get(NodeCredential, hello.node) if node else None
            if not node:
                self.limiter.record(client)
                raise AuthError(wire.CLOSE_UNAUTHORIZED, "unknown node")
            if credential.revoked_at:
                raise AuthError(wire.CLOSE_REVOKED, "node revoked")
            if hello.mode == "connect":
                return self._connect(session, node, credential, hello.secret, client)
            return self._enroll(session, node, credential, hello.secret, client, now)

    def acknowledge_enrollment(self, node_id: str) -> bool:
        """The node saved its new secret (enrolled_ack): it becomes the node secret, the key is used up."""
        with open_session(self.engine) as session:
            node = self._node(session, node_id)
            credential = session.get(NodeCredential, node_id)
            if not credential.pending_secret_hash or credential.revoked_at:
                return False
            self._finish_enrollment(session, node, credential)
            session.commit()
        self.on_feeds_changed()
        return True

    def mark_seen(self, node_id: str, agent_version: str | None = None) -> None:
        with open_session(self.engine) as session:
            node = self._node(session, node_id)
            node.last_seen = utcnow()
            node.agent_version = agent_version or node.agent_version
            session.add(node)
            session.commit()

    def add_event(self, node_id: str, kind: str, detail: str = "") -> None:
        with open_session(self.engine) as session:
            self._event(session, node_id, kind, detail)
            session.commit()

    # --- internals -------------------------------------------------------------------------------------------

    def _connect(
        self, session: Session, node: Node, credential: NodeCredential, secret: str, client: str
    ) -> Authenticated:
        permanent = matches(secret, credential.node_secret_hash)
        pending = matches(secret, credential.pending_secret_hash)  # the enrolled_ack was lost: this is the ack
        if not (permanent or pending):
            self.limiter.record(client)
            raise AuthError(wire.CLOSE_UNAUTHORIZED, "wrong secret")
        if pending and not permanent:
            self._finish_enrollment(session, node, credential)
            session.commit()
            self.on_feeds_changed()
        return Authenticated(node, self.channels_for(node), None)

    def _enroll(
        self, session: Session, node: Node, credential: NodeCredential, secret: str, client: str, now: datetime
    ) -> Authenticated:
        if not credential.enrollment_hash:
            raise AuthError(wire.CLOSE_KEY_EXPIRED, "node key already used")
        if not matches(secret, credential.enrollment_hash):
            self.limiter.record(client)
            raise AuthError(wire.CLOSE_UNAUTHORIZED, "wrong key")
        if aware(credential.enrollment_expires_at) < now:
            raise AuthError(wire.CLOSE_KEY_EXPIRED, "node key expired")
        node_secret = secrets.token_urlsafe(32)
        credential.pending_secret_hash = hash_secret(node_secret)  # replaces an earlier unacknowledged one
        session.add(credential)
        session.commit()
        return Authenticated(node, self.channels_for(node), node_secret)

    def _finish_enrollment(self, session: Session, node: Node, credential: NodeCredential) -> None:
        credential.node_secret_hash, credential.pending_secret_hash = credential.pending_secret_hash, None
        credential.enrollment_hash = credential.enrollment_expires_at = None
        node.status = "OFFLINE"
        self._event(session, node.id, "enrolled", "node enrolled")
        session.add_all([node, credential])

    def _issue_enrollment(self, credential: NodeCredential, node: Node) -> str:
        secret = secrets.token_urlsafe(32)
        credential.enrollment_hash = hash_secret(secret)
        credential.enrollment_expires_at = utcnow() + ENROLLMENT_TTL
        return wire.NodeKey(self.public_url, node.id, secret).encode()

    @staticmethod
    def _node(session: Session, node_id: str) -> Node:
        node = session.get(Node, node_id)
        if not node:
            raise NodeNotFound(node_id)
        return node

    @staticmethod
    def _preset(preset: str | None) -> str:
        preset = preset or DEFAULT_PRESET
        if preset not in PRESET_NAMES:
            raise ValueError(f"unknown preset {preset!r}; known: {', '.join(PRESET_NAMES)}")
        return preset

    @staticmethod
    def _new_id(session: Session) -> str:
        while True:
            node_id = "node-" + "".join(secrets.choice(ID_ALPHABET) for _ in range(8))
            if not session.get(Node, node_id):
                return node_id

    @staticmethod
    def _event(session: Session, node_id: str, kind: str, detail: str) -> None:
        session.add(NodeEvent(node_id=node_id, t=utcnow(), kind=kind, detail=detail))

    def _view(self, session: Session, node: Node) -> NodeOut:
        credential = session.get(NodeCredential, node.id)
        live = self.live.get(node.id, NodeLive())
        online = live.online and node.status != "REVOKED"
        outstanding = credential.enrollment_hash and aware(credential.enrollment_expires_at) > utcnow()
        return NodeOut(
            id=node.id,
            number=node.number,
            feed_id=node_feed_id(node.number),
            name=node.name,
            location=Location(lat=node.lat, lon=node.lon),
            preset=node.preset,
            status="ONLINE" if online else node.status,
            link_quality=live.link_quality if online else None,
            lag_ms=live.lag_ms if online else None,
            last_seen=iso(node.last_seen),
            agent_version=node.agent_version,
            health=live.health,
            key_expires_at=iso(credential.enrollment_expires_at) if outstanding else None,
            created_at=iso(node.created_at),
        )
