"""Request and response bodies that are not table models."""

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from .sim.scenarios import SCENARIOS

ScenarioName = Literal[tuple(SCENARIOS)]  # type: ignore[valid-type]


class LoginIn(BaseModel):
    password: str = Field(max_length=256)  # a longer body is refused before it is compared


class SessionOut(BaseModel):
    authenticated: bool
    sim: bool = True
    role: Literal["viewer", "admin"] | None = None  # null when not logged in


class SimOut(BaseModel):
    scenario: str | None
    clock: str
    speed: float
    scenario_feed: str | None = None  # the node a scenario is about; the caller may choose to listen to it


class JumpIn(BaseModel):
    """Move the replay clock. A scenario names the node it is about (`scenario_feed` in the answer); `speed: 0` freezes the clock."""

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


IF_RATE = 48_000  # every channel is decimated from the sample rate to this baseband rate (node/dsp.py)
RTL_RATES = ((225_001, 300_000), (900_001, 3_200_000))  # what an RTL2832 can sample at


class ReceiverIn(BaseModel):
    """Settings of the rtl_tcp receiver, validated the same way for GET and PUT."""

    name: str = Field(min_length=1, max_length=40)
    host: str = Field(default="", max_length=253, pattern=r"^[A-Za-z0-9._-]*$")
    port: int = Field(ge=1, le=65535)
    freq_hz: int = Field(ge=24_000_000, le=1_766_000_000, description="R820T tuner range")
    rate: int = Field(description="S/s; a multiple of 48 000")
    gain_db: float | None = Field(ge=0, le=50, description="null is automatic gain")
    squelch_db: float = Field(ge=1, le=30)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    enabled: bool = True

    @field_validator("rate")
    @classmethod
    def _rate_supported(cls, value: int) -> int:
        if value % IF_RATE:
            raise ValueError(f"must be a multiple of {IF_RATE}: each channel is decimated down to {IF_RATE} S/s")
        if not any(lo <= value <= hi for lo, hi in RTL_RATES):
            raise ValueError("the RTL-SDR samples at 0.225-0.3 or 0.9-3.2 MS/s")
        return value

    @model_validator(mode="after")
    def _host_to_run(self) -> "ReceiverIn":
        if self.enabled and not self.host:
            raise ValueError("a host is required while the receiver is enabled")
        return self
