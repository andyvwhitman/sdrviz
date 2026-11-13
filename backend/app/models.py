"""SQLModel tables. Each editable resource has a plain `*Base` model (request and response body)
and a table model that adds the primary key and the JSON columns."""

from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class FrequencyBase(SQLModel):
    id: str
    label: str
    freq_mhz: float
    aar_channel: int | None = None  # derived from freq_mhz when omitted
    railroad: str
    use: str
    line: str = ""
    mode: str = "NFM"
    confidence: str = "medium"
    notes: str = ""
    sources: list[str] = []


class Frequency(FrequencyBase, table=True):
    id: str = Field(primary_key=True)
    aar_channel: int = 0
    sources: list[str] = Field(default_factory=list, sa_column=Column(JSON))


class BankBase(SQLModel):
    id: str
    name: str
    description: str = ""
    home_feed: str
    short: str | None = None  # derived from the name when omitted
    sim: bool = False
    frequency_ids: list[str] = []  # ordered: the tile order of the bank


class Bank(BankBase, table=True):
    id: str = Field(primary_key=True)
    short: str = ""
    frequency_ids: list[str] = Field(default_factory=list, sa_column=Column(JSON))


class FeedBase(SQLModel):
    id: str
    name: str
    short: str | None = None  # derived from the name when omitted
    site: str = ""
    lat: float
    lon: float
    coverage_radius_km: float
    hears: list[str] = []  # frequency ids this feed can receive
    driver: str = "rtl_tcp"  # rtl_tcp | sdrviz-agent | file
    driver_sim: bool = False
    host: str = ""
    port: int | None = None
    center_mhz: float = 160.890
    sample_rate_msps: float = 2.4
    gain_db: float = 30.0
    ppm: int = 0
    noise_floor_dbfs: float = -45.0
    enabled: bool = True
    sim: bool = False


class Feed(FeedBase, table=True):
    id: str = Field(primary_key=True)
    short: str = ""
    hears: list[str] = Field(default_factory=list, sa_column=Column(JSON))


class Receiver(SQLModel, table=True):
    """The one rtl_tcp receiver. With no saved row the SDRVIZ_RTLTCP_* settings apply (see radio/receiver.py)."""

    id: int = Field(default=1, primary_key=True)
    name: str
    host: str  # empty: no receiver configured
    port: int
    freq_hz: int  # centre frequency
    rate: int  # sample rate in S/s, a multiple of 48 000
    gain_db: float | None  # None: automatic gain
    squelch_db: float  # opens this far above a channel's noise floor
    lat: float
    lon: float
    enabled: bool = True


class FeedEvent(SQLModel, table=True):
    """A scripted feed state change (the replayed day's health timeline)."""

    id: int | None = Field(default=None, primary_key=True)
    feed_id: str = Field(index=True)
    t: float  # seconds after midnight on the recorded day
    state: str
    label: str = ""


class FeedAck(SQLModel, table=True):
    """An acknowledged fault. `source` is "sim" for the scripted ack and "user" for a POSTed one."""

    id: int | None = Field(default=None, primary_key=True)
    feed_id: str = Field(index=True)
    t: float
    label: str
    reason: str = ""
    source: str = "sim"


class Transmission(SQLModel, table=True):
    """One key-up of the recorded day. Kerchunks (< 250 ms, no speech) have kind="kerchunk"."""

    id: str = Field(primary_key=True)
    kind: str = Field(default="tx", index=True)
    t_offset_s: float = Field(index=True)
    started_at: str
    frequency_id: str = Field(index=True)
    aar_channel: int
    freq_mhz: float | None = None
    feed_id: str
    speaker_role: str | None = None
    speaker: str | None = None
    duration_s: float
    train_id: str | None = Field(default=None, index=True)
    place_id: str | None = Field(default=None, index=True)
    transcript: str = ""
    transcript_state: str = "final"
    confidence: float | None = None
    decode_latency_s: float = 0.0
    words: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    receptions: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    detector: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    source: str = "SIM"  # SEED | SIM
    sim: bool = True


class Prefs(SQLModel, table=True):
    """The single row of operator preferences."""

    id: int = Field(default=1, primary_key=True)
    active_bank: str = "bank-nec"
    displayed_feed: str | None = None  # None: the active bank's home feed
    muted: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    solo: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    record: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    volume: dict[str, float] = Field(default_factory=dict, sa_column=Column(JSON))


class TransitSourceRow(SQLModel, table=True):
    """One transit data feed (the settings page edits these); see app/transit/sources.py for the API shape."""

    __tablename__ = "transit_source"

    id: str = Field(primary_key=True)
    position: int = 0  # display order
    name: str
    agency: str
    kind: str = "gtfs"  # gtfs | amtraker | lines
    enabled: bool = True
    static_url: str | None = None
    rt_trip_updates_url: str | None = None
    rt_vehicle_positions_url: str | None = None
    rt_alerts_url: str | None = None
    api_key: str | None = None
    key_header: str | None = None
    route_types: list[int] | None = Field(default=None, sa_column=Column(JSON))
    exclude_routes: list[str] | None = Field(default=None, sa_column=Column(JSON))
    static_refresh_h: float = 24.0
    rt_poll_s: float = 15.0
    stale_after_s: int | None = None  # null = derived from rt_poll_s when loaded


class TransitMeta(SQLModel, table=True):
    """Small flags for the transit feature, e.g. that the default sources were seeded (so a deleted one stays gone)."""

    __tablename__ = "transit_meta"

    key: str = Field(primary_key=True)
    value: str = ""


class StationGroupRow(SQLModel, table=True):
    """A station several sources share (`st:was`); the curated rows come from app/transit/data/stations.json."""

    __tablename__ = "station_groups"

    station_id: str = Field(primary_key=True)  # "st:<code>"
    name: str
    lat: float
    lon: float


class StationMemberRow(SQLModel, table=True):
    """One source stop that belongs to a group. `suggested` rows are only proposals and never applied."""

    __tablename__ = "station_members"

    source: str = Field(primary_key=True)
    stop_id: str = Field(primary_key=True)
    station_id: str = Field(index=True)
    method: str = "curated"  # curated | suggested | auto
