"""Files of the agent in /etc/sdrviz-node/ (or --config-dir):

node.json    url, node id and the permanent node secret, written by `sdrviz-node enroll` (mode 0600)
agent.toml   optional settings: rtl_host, rtl_port, center_hz, rate, gain_db, squelch_db, channels, workers
state.json   settings changed by the server's commands (tune, gain, squelch, channels); they win over agent.toml
*.key        a node key dropped here is enrolled when the agent starts, then deleted
status.json  what `sdrviz-node status` shows, rewritten by the running agent
"""

import contextlib
import json
import os
import tempfile
import tomllib
from dataclasses import asdict, dataclass, fields
from pathlib import Path

DEFAULT_DIR = Path("/etc/sdrviz-node")
CONFIG_DIR_ENV = "SDRVIZ_NODE_DIR"


@dataclass(frozen=True)
class Credentials:
    url: str  # https://host
    node: str
    secret: str  # the permanent node secret


@dataclass
class Settings:
    rtl_host: str = "127.0.0.1"
    rtl_port: int = 1234
    center_hz: int = 160_897_500  # between AAR 52 and 53
    rate: int = 1_536_000  # covers AAR 07-97
    gain_db: float | None = 36.4  # None: automatic
    squelch_db: float = 8.0
    channels: list[int] | None = None  # AAR channel numbers; None: what the server's preset says
    workers: int | None = None  # threads for the per-channel work; None: one per core


# The settings a server command may change, and so the ones state.json may hold.
RUNTIME_KEYS = ("center_hz", "rate", "gain_db", "squelch_db", "channels")


def default_dir() -> Path:
    return Path(os.environ.get(CONFIG_DIR_ENV, DEFAULT_DIR))


def write_atomically(path: Path, text: str, mode: int = 0o600) -> None:
    """Write a file so that a reader (or a crash) never sees half of it."""
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(handle, "w") as file:
            file.write(text)
        os.chmod(temp, mode)
        os.replace(temp, path)
    except BaseException:
        Path(temp).unlink(missing_ok=True)
        raise


class ConfigDir:
    def __init__(self, path: Path | None = None):
        self.path = Path(path) if path else default_dir()

    @property
    def status_path(self) -> Path:
        return self.path / "status.json"

    def credentials(self) -> Credentials | None:
        try:
            data = json.loads((self.path / "node.json").read_text())
            return Credentials(data["url"], data["node"], data["secret"])
        except (OSError, ValueError, KeyError):
            return None

    def save_credentials(self, credentials: Credentials) -> None:
        write_atomically(self.path / "node.json", json.dumps(asdict(credentials), indent=2) + "\n")

    def key_files(self) -> list[Path]:
        return sorted(self.path.glob("*.key")) if self.path.is_dir() else []

    def settings(self) -> Settings:
        known = {f.name for f in fields(Settings)}
        values: dict = {}
        toml_path = self.path / "agent.toml"
        if toml_path.exists():
            values |= tomllib.loads(toml_path.read_text())
        with contextlib.suppress(OSError, ValueError):
            values |= json.loads((self.path / "state.json").read_text())
        unknown = set(values) - known
        if unknown:
            raise ValueError(f"unknown setting(s) in {self.path}: {', '.join(sorted(unknown))}")
        return Settings(**values)

    def save_state(self, settings: Settings) -> None:
        """Remember what the server's commands set, so it survives a restart."""
        state = {key: getattr(settings, key) for key in RUNTIME_KEYS}
        write_atomically(self.path / "state.json", json.dumps(state, indent=2) + "\n", mode=0o644)

    def write_status(self, status: dict) -> None:
        write_atomically(self.status_path, json.dumps(status, indent=2) + "\n", mode=0o644)

    def read_status(self) -> dict | None:
        try:
            return json.loads(self.status_path.read_text())
        except (OSError, ValueError):
            return None
