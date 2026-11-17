"""Runtime settings, read from SDRVIZ_* environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from .transit.sources import SourceConfig

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SDRVIZ_")

    password: str = "sdrviz"
    secret: str = "dev-secret-change-me"
    data_dir: Path = REPO_ROOT / "data"
    db_path: Path | None = None
    audio_dir: Path | None = None

    # Replay clock. sim_start is "HH:MM:SS"; unset means the current local time of day.
    sim_start: str | None = None
    sim_speed: float = 1.0

    prerender_audio: bool = True
    # False turns the replay off entirely: no fake traffic, transcripts, trains, waterfall or feeds.
    sim: bool = True
    port: int = 8100

    # Real trains. Sources live in the database (seeded with defaults, edited on the Settings page). [] turns
    # the feature off (tests); SDRVIZ_TRANSIT_SOURCES as a JSON list is only read as that on/off switch.
    transit_sources: list[SourceConfig] | None = None
    # An Amtrak station and a commuter station within this many metres are one station (decision 29).
    transit_merge_radius_m: int = 400

    # Live radio. Set SDRVIZ_RTLTCP_HOST (e.g. sdr.local) to stream real audio from an rtl_tcp
    # server instead of the synthetic clips. The rest of the UI still runs on the replay for now.
    rtltcp_host: str | None = None
    rtltcp_port: int = 1234
    rtltcp_freq_hz: int = 160_897_500  # between AAR 52 and 53
    rtltcp_rate: int = 1_536_000  # multiple of 48 000; 1.536 MS/s covers AAR 07-97
    rtltcp_gain_db: float | None = 36.4  # None = automatic gain
    dsp_workers: int | None = None  # threads for the per-channel work; None = one per CPU core
    squelch_db: float = 8.0  # opens this far above the channel's noise floor
    # How the receiver appears on the Feeds page and the map.
    rtltcp_name: str = "SDR-01 Pi"
    rtltcp_lat: float = 38.8973  # Washington Union Station, until the receiver is a real feed row
    rtltcp_lon: float = -77.0063

    @property
    def transit_dir(self) -> Path:
        return self.data_dir / "transit"

    @property
    def sim_dir(self) -> Path:
        return self.data_dir / "sim"

    @property
    def seed_dir(self) -> Path:
        return self.data_dir / "seed"

    @property
    def geo_dir(self) -> Path:
        return self.data_dir / "geo"

    @property
    def database_file(self) -> Path:
        return self.db_path or self.data_dir / "db" / "sdrviz.sqlite"

    @property
    def audio_path(self) -> Path:
        return self.audio_dir or self.data_dir / "audio"
