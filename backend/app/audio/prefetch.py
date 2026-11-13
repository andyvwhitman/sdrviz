"""Background pre-render of the next few simulated minutes, so key-ups never wait for a clip."""

import logging
import threading
from collections.abc import Callable

from ..sim.day import SimDay
from .cache import AudioStore, job_for

log = logging.getLogger(__name__)

LOOKAHEAD_S = 300
POLL_S = 3.0


class Prefetcher(threading.Thread):
    def __init__(self, store: AudioStore, day: SimDay, now: Callable[[], float]):
        super().__init__(name="audio-prefetch", daemon=True)
        self.store, self.day, self.now = store, day, now
        self._stop_event = threading.Event()
        self._failed: set[str] = set()

    def stop(self) -> None:
        self._stop_event.set()

    def run(self) -> None:
        while not self._stop_event.is_set():
            t = self.now()
            for tx in self.day.window(t, t + LOOKAHEAD_S):
                if self._stop_event.is_set():
                    return
                if tx.id not in self._failed and not self.store.is_ready(tx.id):
                    try:
                        self.store.ensure(job_for(tx))
                    except Exception:
                        log.exception("could not render %s", tx.id)
                        self._failed.add(tx.id)
            self._stop_event.wait(POLL_S)
