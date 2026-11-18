"""Tables of the node registry. Only SHA-256 hashes of secrets are stored, never a secret."""

from datetime import datetime

from sqlmodel import Field, SQLModel


class Node(SQLModel, table=True):
    id: str = Field(primary_key=True)  # "node-" + 8 random lowercase letters and digits
    number: int = Field(unique=True)  # 1..65535, the prefix of the binary frames
    name: str
    lat: float
    lon: float
    preset: str = "aar"
    status: str = "PENDING"  # PENDING | OFFLINE | REVOKED; ONLINE is only ever live (see registry.live)
    created_at: datetime
    last_seen: datetime | None = None
    agent_version: str | None = None


class NodeCredential(SQLModel, table=True):
    __tablename__ = "node_credential"

    node_id: str = Field(primary_key=True, foreign_key="node.id")
    enrollment_hash: str | None = None  # None: no key outstanding (never issued, used up, or revoked)
    enrollment_expires_at: datetime | None = None
    node_secret_hash: str | None = None  # the permanent secret; None until enrolled, and after a revoke
    pending_secret_hash: str | None = None  # issued by an enrollment whose enrolled_ack has not arrived yet
    revoked_at: datetime | None = None


class NodeEvent(SQLModel, table=True):
    __tablename__ = "node_event"

    """What happened to a node, newest last; the Settings detail view shows the latest 50."""

    id: int | None = Field(default=None, primary_key=True)
    node_id: str = Field(index=True, foreign_key="node.id")
    t: datetime
    kind: str  # enrolled | online | offline | reconnect | rekeyed | revoked | command | gain | error
    detail: str = ""
