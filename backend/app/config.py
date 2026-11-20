"""Runtime settings, read from SDRVIZ_* environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from .transit.sources import SourceConfig

REPO_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_PASSWORDS = {"sdrviz", "change-me", "password", ""}
DEFAULT_SECRETS = {"dev-secret-change-me", "change-me-too", "change-me", ""}
MIN_PASSWORD_LENGTH = 8
MIN_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SDRVIZ_")

    password: str = "sdrviz"  # the viewer password: read and listen
    # The admin password: nodes, sources, frequencies, assignments, settings. Unset: the one password above is admin.
    admin_password: str | None = None
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
    # The address nodes reach this server at; it goes into node keys (https://sdr.example.com in production).
    public_url: str = "http://localhost:8100"

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

    # Recording (D-1) and transcription (D-2), retention (D-3). Audio files live under audio_dir as YYYY/MM/DD/*.ogg.
    recording_max_s: float = 120.0  # a longer transmission goes on in a second file
    transcriber: str = "faster-whisper"  # or "none": rows are saved without a transcript
    whisper_model: str = "small.en"
    whisper_threads: int = 2  # leave the other cores of a small server to the web app
    audio_retention_days: int = 90
    audio_max_gb: float = 10.0

    @property
    def production(self) -> bool:
        """A public site: served over https. The checks and the Secure cookie follow from this."""
        return self.public_url.startswith("https://")

    def production_problems(self) -> list[str]:
        """Settings a public site must not start with."""
        problems = []
        if self.password in DEFAULT_PASSWORDS or len(self.password) < MIN_PASSWORD_LENGTH:
            problems.append(f"SDRVIZ_PASSWORD is a default or shorter than {MIN_PASSWORD_LENGTH} characters")
        if self.secret in DEFAULT_SECRETS or len(self.secret) < MIN_SECRET_LENGTH:
            problems.append(f"SDRVIZ_SECRET is a default or shorter than {MIN_SECRET_LENGTH} characters")
        if self.admin_password:  # unset or empty (compose passes "") means single-password mode
            if self.admin_password in DEFAULT_PASSWORDS or len(self.admin_password) < MIN_PASSWORD_LENGTH:
                problems.append(f"SDRVIZ_ADMIN_PASSWORD is a default or shorter than {MIN_PASSWORD_LENGTH} characters")
            if self.admin_password == self.password:
                problems.append("SDRVIZ_ADMIN_PASSWORD equals SDRVIZ_PASSWORD")
        return problems

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
