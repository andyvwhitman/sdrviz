"""Audio retention (D-3): audio older than the age limit, then the oldest audio while the store is over its size
cap, is deleted. The rows stay (transcripts and metadata are kept forever) with audio_state=expired."""

import asyncio
import contextlib
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING

from sqlalchemy.engine import Engine
from sqlmodel import col, select

from ..db import open_session
from .models import Recording
from .recorder import utc_now

if TYPE_CHECKING:
    from ..runtime import Runtime

log = logging.getLogger(__name__)

EVERY_S = 3600


def enforce(engine: Engine, audio_dir: Path, max_age_days: int, max_bytes: int, now: datetime | None = None) -> int:
    """Expire what is over a limit; returns how many recordings lost their audio."""
    cutoff = (now or utc_now()) - timedelta(days=max_age_days)
    expired = 0
    with open_session(engine) as session:
        kept = list(
            session.exec(
                select(Recording)
                .where(Recording.audio_state == "ok")
                .order_by(col(Recording.started_at).desc(), col(Recording.id).desc())  # newest first
            )
        )
        total = sum(row.audio_bytes for row in kept)
        while kept and (_aware(kept[-1].started_at) < cutoff or total > max_bytes):
            row = kept.pop()  # the oldest
            total -= row.audio_bytes
            (audio_dir / row.audio_path).unlink(missing_ok=True)
            row.audio_state = "expired"
            session.add(row)
            expired += 1
        session.commit()
    if expired:
        _remove_empty_folders(audio_dir)
        log.info("retention: %d recording(s) lost their audio; %.1f MB kept", expired, total / 1e6)
    return expired


def _aware(moment: datetime) -> datetime:
    return moment if moment.tzinfo else moment.replace(tzinfo=utc_now().tzinfo)


def _remove_empty_folders(audio_dir: Path) -> None:
    """The YYYY/MM/DD folders that have nothing left in them (the deepest first)."""
    for folder in sorted((p for p in audio_dir.glob("*/*/*") if p.is_dir()), reverse=True):
        with contextlib.suppress(OSError):  # not empty
            folder.rmdir()
    for folder in sorted((p for p in audio_dir.glob("*/*") if p.is_dir()), reverse=True):
        with contextlib.suppress(OSError):
            folder.rmdir()
    for folder in (p for p in audio_dir.glob("*") if p.is_dir() and p.name.isdigit()):
        with contextlib.suppress(OSError):
            folder.rmdir()


async def run_forever(rt: "Runtime") -> None:
    """At start and then every hour."""
    settings = rt.settings
    while True:
        try:
            await asyncio.to_thread(
                enforce, rt.db, settings.audio_path, settings.audio_retention_days, int(settings.audio_max_gb * 1e9)
            )
        except Exception:
            log.exception("audio retention failed")
        await asyncio.sleep(EVERY_S)
