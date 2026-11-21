import os
import platform
import resource
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter

from ..deps import RT
from ..sim.live_state import system_block

router = APIRouter(tags=["system"])

VERSION = "0.1.0"
STARTED_AT = time.time()
REPO_ROOT = Path(__file__).resolve().parents[3]
DIR_SIZE_TTL_S = 30


@router.get("/system")
def system(rt: RT) -> dict[str, Any]:
    """Host, decoder and disk readings at the sim clock (the `system` block of LiveState)."""
    block = system_block(rt.data, rt.clock.now())
    return {**block, "version": VERSION, "sim": rt.settings.sim}


@router.get("/system/backend")
def backend(rt: RT) -> dict[str, Any]:
    """The backend process itself: build, uptime, CPU, memory, disk use and connected clients."""
    settings = rt.settings
    data_dir = settings.data_dir
    disk = shutil.disk_usage(data_dir)
    hub = rt.hub
    return {
        "build": {
            "version": VERSION,
            "commit": _git_commit(),
            "python": platform.python_version(),
            "platform": platform.platform(terse=True),
            "pid": os.getpid(),
        },
        "started_at": STARTED_AT,
        "uptime_s": round(time.time() - STARTED_AT),
        "sim": {"enabled": settings.sim, "speed": rt.clock.speed},
        "cpu": {
            "process_pct": _cpu.sample(),
            "load_avg": [round(x, 2) for x in os.getloadavg()],
            "cores": os.cpu_count(),
        },
        "memory": {"rss_bytes": _rss_bytes(), "peak_rss_bytes": _peak_rss_bytes()},
        "disk": {
            "total_bytes": disk.total,
            "free_bytes": disk.free,
            "data_bytes": _dir_size(data_dir),
            "audio_bytes": _dir_size(settings.audio_path),
            "db_bytes": _file_size(settings.database_file),
        },
        "websocket": {
            "clients": len(hub.clients),
            "audio_subscriptions": sum(len(c.audio) for c in hub.clients),
            "spectrum_watchers": len(hub.watched_feeds()),
        },
    }


@router.get("/live/state")
def live_state(rt: RT, listen_feed: str | None = None) -> dict[str, Any]:
    """The current LiveState for a client listening to `listen_feed`: what the WebSocket sends as `snapshot`."""
    return rt.live_state(listen_feed)


# --- process readings (stdlib only) -----------------------------------------------------


class _CpuSampler:
    """Process CPU use between two calls, as a percentage of one core."""

    def __init__(self) -> None:
        self._last = (time.monotonic(), time.process_time())
        self._pct = 0.0

    def sample(self) -> float:
        now, cpu = time.monotonic(), time.process_time()
        wall = now - self._last[0]
        if wall >= 1.0:  # shorter gaps are too noisy: keep the last reading
            self._pct = round(100 * (cpu - self._last[1]) / wall, 1)
            self._last = (now, cpu)
        return self._pct


_cpu = _CpuSampler()


def _peak_rss_bytes() -> int:
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return peak if sys.platform == "darwin" else peak * 1024  # macOS counts bytes, Linux kilobytes


def _rss_bytes() -> int:
    """Resident memory now: /proc on Linux, `ps` elsewhere."""
    statm = Path("/proc/self/statm")
    if statm.exists():
        return int(statm.read_text().split()[1]) * os.sysconf("SC_PAGE_SIZE")
    try:
        out = subprocess.run(["ps", "-o", "rss=", "-p", str(os.getpid())], capture_output=True, text=True, timeout=2)
        return int(out.stdout.strip()) * 1024
    except (OSError, ValueError, subprocess.SubprocessError):
        return _peak_rss_bytes()


def _git_commit() -> str | None:
    try:
        out = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=2
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() or None


def _file_size(path: Path) -> int:
    return path.stat().st_size if path.exists() else 0


_dir_sizes: dict[Path, tuple[float, int]] = {}


def _dir_size(path: Path) -> int:
    """Total size of the files under `path`, recounted at most every DIR_SIZE_TTL_S seconds."""
    checked, size = _dir_sizes.get(path, (0.0, 0))
    if time.monotonic() - checked > DIR_SIZE_TTL_S:
        size = sum(f.stat().st_size for f in path.rglob("*") if f.is_file()) if path.exists() else 0
        _dir_sizes[path] = (time.monotonic(), size)
    return size
