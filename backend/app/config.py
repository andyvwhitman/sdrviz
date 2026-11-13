"""Runtime settings, read from SDRVIZ_* environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

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
    port: int = 8100

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
