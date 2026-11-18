"""Transcription of recordings (D-2).

`Transcriber.transcribe(path) -> text` is the whole interface; the engine is the SDRVIZ_TRANSCRIBER setting
(faster-whisper on the server CPU, or none). One background thread takes pending rows, oldest first, so the
event loop never waits for a model. A failure marks that row failed and the thread moves on.
"""

import logging
import re
import threading
from collections.abc import Callable
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

from sqlmodel import select

from ..config import Settings
from ..db import open_session
from .models import Recording

if TYPE_CHECKING:
    from ..runtime import Runtime

log = logging.getLogger(__name__)

RAILROAD_TERMS = ["clear signal", "foul time", "MP", "milepost", "track", "copy", "over", "dispatcher", "yard limits"]
PROMPT_MAX_CHARS = 600  # Whisper reads about the last 224 tokens of a prompt
IDLE_POLL_S = 30.0  # the worker looks for pending rows at least this often, woken or not


class Transcriber(Protocol):
    name: str

    def transcribe(self, path: Path) -> str: ...


class FasterWhisperTranscriber:
    """faster-whisper on the CPU, int8. The model loads on the first clip and is cached under `download_root`."""

    def __init__(self, model: str, download_root: Path, threads: int, vocabulary: Callable[[], str]):
        self.name = f"faster-whisper:{model}"
        self._model_name, self._root, self._threads = model, download_root, threads
        self._vocabulary = vocabulary
        self._model = None

    def transcribe(self, path: Path) -> str:
        if self._model is None:
            from faster_whisper import WhisperModel  # imported here: a heavy import, and not needed with engine none

            self._root.mkdir(parents=True, exist_ok=True)
            self._model = WhisperModel(
                self._model_name,
                device="cpu",
                compute_type="int8",
                cpu_threads=self._threads,
                download_root=str(self._root),
            )
        segments, _info = self._model.transcribe(
            str(path),
            language="en",
            beam_size=1,
            vad_filter=True,  # skips the hiss between words, where Whisper invents text
            initial_prompt=self._vocabulary(),
            condition_on_previous_text=False,
        )
        return " ".join(segment.text.strip() for segment in segments).strip()


def vocabulary_prompt(rt: "Runtime") -> str:
    """Railroad words for Whisper's initial prompt: this app's channels, lines and stations, then the jargon."""
    terms: list[str] = []
    for freq in rt.world.freqs.values():
        terms += [freq.label, freq.line]
    for place in rt.world.places.values():
        if place.get("kind") == "station" and not place.get("fictional"):
            terms.append(re.sub(r"\s*\(.*?\)", "", place["name"]))
    terms += RAILROAD_TERMS
    prompt, seen = "Railroad radio: ", set()
    for term in terms:
        if not term or term.lower() in seen:
            continue
        seen.add(term.lower())
        if len(prompt) + len(term) + 2 > PROMPT_MAX_CHARS and term not in RAILROAD_TERMS:
            continue
        prompt += term + ", "
    return prompt.rstrip(", ") + "."


def make_transcriber(settings: Settings, vocabulary: Callable[[], str]) -> Transcriber | None:
    match settings.transcriber:
        case "none":
            return None
        case "faster-whisper":
            return FasterWhisperTranscriber(
                settings.whisper_model, settings.data_dir / "models", settings.whisper_threads, vocabulary
            )
        case other:
            raise ValueError(f"unknown SDRVIZ_TRANSCRIBER {other!r} (faster-whisper or none)")


class Transcription:
    """The worker: pending recordings in, transcripts out."""

    def __init__(self, rt: "Runtime", transcriber: Transcriber | None):
        self.rt = rt
        self.transcriber = transcriber
        self._wake = threading.Event()
        self._stopping = False
        self._thread: threading.Thread | None = None

    @property
    def enabled(self) -> bool:
        return self.transcriber is not None

    def start(self) -> None:
        if self.enabled and self._thread is None:
            self._thread = threading.Thread(target=self._run, name="transcriber", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stopping = True
        self._wake.set()
        if self._thread:
            self._thread.join(timeout=2)  # a clip in the middle of a model call is abandoned with the process

    def wake(self) -> None:
        self._wake.set()

    def _run(self) -> None:
        while not self._stopping:
            if not self.process_next():
                self._wake.wait(IDLE_POLL_S)
                self._wake.clear()

    def process_next(self) -> bool:
        """Transcribe the oldest pending recording. False when there is none."""
        assert self.transcriber is not None
        with open_session(self.rt.db) as session:
            row = session.exec(
                select(Recording)
                .where(Recording.transcript_state == "pending")
                .order_by(Recording.started_at, Recording.id)
                .limit(1)
            ).first()
            if row is None:
                return False
            row.engine = self.transcriber.name
            try:
                if row.audio_state != "ok":
                    raise FileNotFoundError("the audio has expired")
                text = self.transcriber.transcribe(self.rt.settings.audio_path / row.audio_path).strip()
            except Exception:
                log.exception("could not transcribe recording %s", row.id)
                row.transcript_state = "failed"
            else:
                row.transcript, row.transcript_state = text, "done" if text else "empty"
            session.add(row)
            session.commit()
        return True
