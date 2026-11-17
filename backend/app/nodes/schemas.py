"""Request and response bodies of /api/nodes (contract: docs/node-protocol.md, part 2)."""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, field_validator

from ..live.node_protocol import IF_RATE_MULTIPLE


class Location(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class NodeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    location: Location
    preset: str | None = None


class NodePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=40)
    location: Location | None = None
    preset: str | None = None


class NodeOut(BaseModel):
    id: str
    number: int
    feed_id: str
    name: str
    location: Location
    preset: str
    status: Literal["PENDING", "ONLINE", "OFFLINE", "REVOKED"]
    link_quality: int | None
    lag_ms: int | None
    last_seen: str | None
    agent_version: str | None
    health: dict[str, Any] | None
    key_expires_at: str | None
    created_at: str


class NodeEventOut(BaseModel):
    t: str
    kind: str
    detail: str


class NodeDetail(NodeOut):
    events: list[NodeEventOut]


class NodeWithKey(BaseModel):
    node: NodeOut
    key: str


# --- commands ----------------------------------------------------------------------------------------------


class TuneIn(BaseModel):
    type: Literal["tune"]
    center_hz: int = Field(ge=24_000_000, le=1_766_000_000)
    rate: int = Field(gt=0, le=3_200_000)

    @field_validator("rate")
    @classmethod
    def multiple_of_48k(cls, rate: int) -> int:
        if rate % IF_RATE_MULTIPLE:
            raise ValueError(f"rate must be a multiple of {IF_RATE_MULTIPLE}")
        return rate


class GainIn(BaseModel):
    type: Literal["gain"]
    gain_db: float | None = Field(ge=0, le=50)  # None: automatic


class SquelchIn(BaseModel):
    type: Literal["squelch"]
    squelch_db: float = Field(ge=0, le=40)


class ChannelsIn(BaseModel):
    type: Literal["channels"]
    channels: list[Annotated[int, Field(ge=1, le=255)]] = Field(min_length=1, max_length=255)


class RestartIn(BaseModel):
    type: Literal["restart"]


class SetServerIn(BaseModel):
    type: Literal["set_server"]
    url: str = Field(pattern=r"^https?://[^/\s]+/?$")


CommandIn = Annotated[TuneIn | GainIn | SquelchIn | ChannelsIn | RestartIn | SetServerIn, Field(discriminator="type")]


class CommandError(BaseModel):
    code: str
    message: str


class CommandResult(BaseModel):
    id: str
    type: str
    status: Literal["acked", "failed", "timeout"]
    error: CommandError | None = None
