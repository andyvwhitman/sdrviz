"""CPU load and temperature of the machine, for the health message. Linux first; elsewhere best effort."""

import os
from pathlib import Path

THERMAL = Path("/sys/class/thermal/thermal_zone0/temp")
PROC_STAT = Path("/proc/stat")


class CpuMeter:
    """Busy share of all cores since the previous call, 0-100."""

    def __init__(self) -> None:
        self._last = self._read()

    @staticmethod
    def _read() -> tuple[int, int] | None:
        try:
            fields = [int(x) for x in PROC_STAT.read_text().splitlines()[0].split()[1:]]
        except (OSError, ValueError, IndexError):
            return None
        idle = fields[3] + (fields[4] if len(fields) > 4 else 0)  # idle + iowait
        return idle, sum(fields)

    def percent(self) -> float:
        now = self._read()
        if now is None or self._last is None:  # not Linux: the one-minute load as a share of the cores
            return round(min(100.0, 100 * os.getloadavg()[0] / (os.cpu_count() or 1)), 1)
        idle, total = now[0] - self._last[0], now[1] - self._last[1]
        self._last = now
        return round(100 * (1 - idle / total), 1) if total > 0 else 0.0


def temperature_c() -> float | None:
    try:
        return round(int(THERMAL.read_text()) / 1000, 1)
    except (OSError, ValueError):
        return None
