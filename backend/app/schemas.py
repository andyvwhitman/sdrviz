"""Request and response bodies that are not table models."""

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator
from sqlmodel import SQLModel

from .sim.scenarios import SCENARIOS

ScenarioName = Literal[tuple(SCENARIOS)]  # type: ignore[valid-type]


class LoginIn(BaseModel):
    password: str


class SessionOut(BaseModel):
    authenticated: bool
    sim: bool = True


class SimOut(BaseModel):
    scenario: str | None
    clock: str
    speed: float


class JumpIn(BaseModel):
    """Move the replay clock. A scenario also selects its bank; `speed: 0` freezes the clock."""

    scenario: ScenarioName | None = None
    clock: str | None = None
    speed: float | None = Field(default=None, ge=0)

    @field_validator("clock")
    @classmethod
    def _clock_format(cls, value: str | None) -> str | None:
        if value is not None and not re.fullmatch(r"\d{1,2}:\d{2}(:\d{2}(\.\d)?)?", value):
            raise ValueError("expected HH:MM or HH:MM:SS")
        return value


class AckIn(BaseModel):
    reason: str = ""


class PrefsModel(BaseModel):
    active_bank: str
    displayed_feed: str | None = None
    muted: list[str] = []
    solo: list[str] = []
    record: list[str] = []
    volume: dict[str, float] = {}


class TransmissionOut(SQLModel):
    """A transmission row. `t_offset_s` and `started_at` are shifted into the queried window."""

    id: str
    t_offset_s: float
    started_at: str
    clock: str
    frequency_id: str
    aar_channel: int
    freq_mhz: float | None
    feed_id: str
    speaker_role: str | None
    speaker: str | None
    duration_s: float
    train_id: str | None
    place_id: str | None
    transcript: str
    transcript_state: str
    confidence: float | None
    decode_latency_s: float
    words: list[dict[str, Any]]
    receptions: list[dict[str, Any]]
    detector: dict[str, Any] | None
    source: str
    sim: bool


class TransmissionPage(BaseModel):
    items: list[TransmissionOut]
    total: int
    next_cursor: str | None


class Waveform(BaseModel):
    duration_s: float
    peaks: list[float]
