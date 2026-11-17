"""The node registry: create nodes, issue and check enrollment keys and node secrets (docs/node-protocol.md).

Secrets are 32 random bytes in base64url. Only their SHA-256 hashes reach the database. A node key carries
the enrollment secret; enrolling exchanges it for a permanent node secret that the node keeps.
"""

import hashlib
import hmac
import secrets
import string
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.engine import Engine
from sqlmodel import Session, col, func, select

from ..auth import LoginLimiter
from ..db import open_session
from ..live import node_protocol as wire
from .models import Node, NodeCredential, NodeEvent
from .schemas import CommandIn, CommandResult, Location, NodeDetail, NodeEventOut, NodeOut

ENROLLMENT_TTL = timedelta(hours=24)
PRESETS = {"aar": list(range(7, 98))}  # preset name → AAR channel numbers
DEFAULT_PRESET = "aar"
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
        # BE-5 sets this to send a command to a connected node and wait for its ack.
        self.command_sender: Callable[[str, CommandIn], Awaitable[CommandResult]] | None = None

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

    def channels_for(self, preset: str) -> list[int]:
        return PRESETS[preset]

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
            return self._view(session, node)

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
            return self._view(session, node)

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
        return Authenticated(node, PRESETS[node.preset], None)

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
        return Authenticated(node, PRESETS[node.preset], node_secret)

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
        if preset not in PRESETS:
            raise ValueError(f"unknown preset {preset!r}; known: {', '.join(PRESETS)}")
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
            feed_id=f"node-{node.number}",
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
