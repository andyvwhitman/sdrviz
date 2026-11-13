"""Fake radio audio: text-to-speech, squeezed through an NFM-style filter chain.

    macOS `say` (or `espeak-ng`, or a tone-burst pattern)  ->  one ffmpeg call  ->  Opus + PCM

The ffmpeg call fits the speech to the row's duration, band-limits and compresses it, mixes
low-level pink noise under it and appends a short squelch-tail burst. It writes two files from
the same filter graph: the Opus clip served to History, and the 8 kHz PCM used for live audio.
"""

import functools
import logging
import math
import re
import shutil
import struct
import subprocess
import tempfile
import wave
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)

TAIL_S = 0.12  # squelch tail appended after the key-up ends
SPEECH_RATE_HZ = 16_000
TEMPO_RANGE = (0.6, 1.6)

# Preferred macOS voices by speaker role; the first installed one wins.
VOICES = {
    "crew": ("Fred", "Ralph", "Reed (English (US))"),
    "dispatcher": ("Samantha", "Kathy", "Flo (English (US))"),
    "yardmaster": ("Ralph", "Rocko (English (US))"),
    "operator": ("Eddy (English (US))", "Sandy (English (US))", "Shelley (English (US))"),
    "detector": ("Zarvox", "Trinoids"),  # the robotic wayside voice
    "MOW": ("Junior", "Fred"),
    "unknown": ("Albert", "Fred"),
}


@dataclass(frozen=True)
class ClipJob:
    """What to render for one transmission (or kerchunk)."""

    id: str
    text: str
    duration_s: float
    role: str = "unknown"
    speaker: str | None = None

    @property
    def has_speech(self) -> bool:
        return bool(self.text.strip())


def missing_tools() -> list[str]:
    return [tool for tool in ("ffmpeg", "ffprobe") if not shutil.which(tool)]


@functools.cache
def installed_voices() -> frozenset[str]:
    if not shutil.which("say"):
        return frozenset()
    out = subprocess.run(["say", "-v", "?"], capture_output=True, text=True, check=False).stdout
    # "Fred                en_US    # Hello! ..." -> "Fred"; names can contain spaces and parentheses
    matches = (re.match(r"(.+?)\s+[a-z]{2}_[A-Z]{2}\s+#", line) for line in out.splitlines())
    return frozenset(m.group(1) for m in matches if m)


def pick_voice(role: str, speaker: str | None) -> str | None:
    candidates = [v for v in VOICES.get(role, VOICES["unknown"]) if v in installed_voices()]
    if not candidates:
        return None
    return candidates[sum(map(ord, speaker or "")) % len(candidates)]


def speech_rate_wpm(job: ClipJob) -> int:
    words = len(job.text.split())
    return int(max(120, min(260, words / max(job.duration_s - 0.5, 1.0) * 60)))


def tone_burst_speech(job: ClipJob, out: Path) -> Path:
    """Last-resort 'speech': a syllable-like pattern of tone bursts, written as a WAV."""
    rate = 16_000
    syllables = max(2, len(job.text.split()) * 2)
    total = int(rate * min(job.duration_s, syllables * 0.18))
    with wave.open(str(out), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        frames = bytearray()
        for n in range(total):
            syllable = n // (rate * 0.09)
            on = int(syllable) % 2 == 0
            freq = 420 + 60 * (int(syllable) % 5)
            frames += struct.pack("<h", int(6000 * math.sin(2 * math.pi * freq * n / rate)) if on else 0)
        wav.writeframes(bytes(frames))
    return out


def synthesize_speech(job: ClipJob, workdir: Path) -> Path | None:
    """Render the transcript to an audio file, or None for a carrier with no speech."""
    if not job.has_speech:
        return None
    wpm = speech_rate_wpm(job)
    if shutil.which("say"):
        out = workdir / "speech.aiff"
        cmd = ["say", "-r", str(wpm), "-o", str(out)]
        if voice := pick_voice(job.role, job.speaker):
            cmd += ["-v", voice]
        subprocess.run([*cmd, job.text], check=True, capture_output=True)
        return out
    if shutil.which("espeak-ng"):
        out = workdir / "speech.wav"
        subprocess.run(["espeak-ng", "-s", str(wpm), "-w", str(out), job.text], check=True, capture_output=True)
        return out
    log.warning("neither `say` nor `espeak-ng` is installed: fake audio uses tone bursts")
    return tone_burst_speech(job, workdir / "speech.wav")


def media_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return float(out.strip())


def filter_graph(speech_tempo: float | None, total_s: float, duration_s: float) -> str:
    """The ffmpeg filter graph. Inputs: 0 speech or silence, 1 pink noise bed, 2 white squelch tail."""
    if speech_tempo is None:  # a carrier: a little more noise stands in for the unmodulated signal
        voice = f"[0:a]apad=whole_dur={total_s:.3f}[v]"
        bed = "volume=2.0"
    else:
        voice = (
            f"[0:a]aresample={SPEECH_RATE_HZ},aformat=channel_layouts=mono,atempo={speech_tempo:.4f},"
            "highpass=f=300,lowpass=f=3000,acompressor=threshold=0.05:ratio=6,alimiter=limit=0.7,"
            f"apad=whole_dur={total_s:.3f}[v]"
        )
        bed = "volume=0.8"
    return (
        f"{voice};[1:a]{bed}[bg];"
        f"[2:a]afade=t=out:st=0:d={TAIL_S},adelay={int(duration_s * 1000)}:all=1[tail];"
        f"[v][bg][tail]amix=inputs=3:duration=longest:normalize=0,atrim=0:{total_s:.3f},"
        "alimiter=limit=0.9,asplit=2[o1][o2]"
    )


def render_clip(job: ClipJob, webm: Path, pcm: Path) -> None:
    """Write the Opus clip and the 8 kHz PCM for `job` (both are replaced atomically)."""
    total = job.duration_s + TAIL_S
    with tempfile.TemporaryDirectory(prefix="sdrviz-audio-") as tmp:
        workdir = Path(tmp)
        speech = synthesize_speech(job, workdir)
        tempo = None
        if speech:
            natural = media_duration(speech)
            tempo = min(TEMPO_RANGE[1], max(TEMPO_RANGE[0], natural / max(job.duration_s - 0.3, 0.5)))
        source = (
            ["-i", str(speech)] if speech else ["-f", "lavfi", "-t", f"{total:.3f}", "-i", "anullsrc=r=16000:cl=mono"]
        )
        pink = f"anoisesrc=color=pink:amplitude=0.03:sample_rate={SPEECH_RATE_HZ}"
        white = f"anoisesrc=color=white:amplitude=0.15:sample_rate={SPEECH_RATE_HZ}"
        tmp_webm, tmp_pcm = workdir / "clip.webm", workdir / "clip.pcm"
        cmd = [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            *source,
            "-f",
            "lavfi",
            "-t",
            f"{total:.3f}",
            "-i",
            pink,
            "-f",
            "lavfi",
            "-t",
            f"{TAIL_S}",
            "-i",
            white,
            "-filter_complex",
            filter_graph(tempo, total, job.duration_s),
            "-map",
            "[o1]",
            "-c:a",
            "libopus",
            "-b:a",
            "16k",
            "-application",
            "voip",
            "-ar",
            str(SPEECH_RATE_HZ),
            "-f",
            "webm",
            str(tmp_webm),
            "-map",
            "[o2]",
            "-ar",
            "8000",
            "-ac",
            "1",
            "-f",
            "s16le",
            str(tmp_pcm),
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        webm.parent.mkdir(parents=True, exist_ok=True)
        # The PCM lands last: its presence marks a finished clip.
        shutil.move(tmp_webm, webm)
        shutil.move(tmp_pcm, pcm)
