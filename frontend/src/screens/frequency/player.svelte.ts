import { api } from "$lib/api/client";
import { audio } from "$lib/stores/audio.svelte";
import type { Recording } from "$lib/types/recordings";

export type PlayStatus = "idle" | "loading" | "playing" | "paused";

const SEEK_STEP_S = 2;

/** Whether this browser can play Ogg Opus (Safari before 18.4 cannot). */
export function canPlayOggOpus(): boolean {
  try {
    return document.createElement("audio").canPlayType('audio/ogg; codecs=opus') !== "";
  } catch {
    return false;
  }
}

/**
 * Plays saved transmissions, one at a time, with a plain HTMLAudioElement. The corner mute silences it like
 * everything else (the clip still runs, so the progress line moves). Leaving the page stops it.
 */
class Player {
  playingId = $state<number | null>(null);
  status = $state<PlayStatus>("idle");
  /** seconds into the clip */
  position = $state(0);
  /** seconds, from the row until the file reports its own */
  duration = $state(0);
  /** rows whose audio would not load; pressing play on one tries again */
  failed = $state<number[]>([]);
  readonly supported = canPlayOggOpus();

  /** called when a clip plays to its end (continuous play picks the next one) */
  onended: ((id: number) => void) | null = null;

  private element = $state.raw<HTMLAudioElement | null>(null);
  private frame = 0;

  constructor() {
    // the corner mute follows the clip in and out of silence
    $effect.root(() => {
      $effect(() => {
        if (this.element) this.element.muted = audio.muted;
      });
      // live audio ducks while a clip is audible
      $effect(() => audio.duck(this.status === "playing" && !audio.muted));
    });
  }

  isFailed = (id: number): boolean => this.failed.includes(id);

  /** Start a row, stopping whatever played before. Pressing the playing row pauses it, a paused one resumes. */
  toggle(rec: Recording, title?: string): void {
    if (this.playingId === rec.id && this.element) {
      if (this.element.paused) void this.element.play().catch(() => this.fail(rec.id));
      else this.element.pause();
      return;
    }
    this.start(rec, title);
  }

  start(rec: Recording, title = rec.frequency_id.toUpperCase()): void {
    if (!rec.audio_url) return;
    this.stop();
    this.failed = this.failed.filter((id) => id !== rec.id);
    const element = new Audio(api.recordings.audioUrl(rec.id));
    element.preload = "auto";
    element.muted = audio.muted;
    this.element = element;
    this.playingId = rec.id;
    this.position = 0;
    this.duration = rec.duration_s;
    this.status = "loading";

    element.addEventListener("playing", () => {
      this.status = "playing";
      this.tick();
    });
    element.addEventListener("pause", () => {
      if (this.element !== element || element.ended) return;
      this.status = "paused";
      cancelAnimationFrame(this.frame);
    });
    element.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(element.duration) && element.duration > 0) this.duration = element.duration;
    });
    element.addEventListener("ended", () => {
      const id = rec.id;
      this.stop();
      this.onended?.(id);
    });
    element.addEventListener("error", () => this.fail(rec.id));
    void element.play().catch(() => this.fail(rec.id));
    this.setMediaSession(title);
  }

  /** Jump to a point of the clip (a click on the track, or the arrow keys). */
  seek(seconds: number): void {
    if (!this.element) return;
    const to = Math.min(Math.max(0, seconds), this.duration || seconds);
    this.element.currentTime = to;
    this.position = to;
  }

  seekBy(direction: -1 | 1): void {
    this.seek(this.position + direction * SEEK_STEP_S);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    const element = this.element;
    this.element = null;
    if (element) {
      element.pause();
      element.removeAttribute("src");
      element.load();
    }
    this.playingId = null;
    this.status = "idle";
    this.position = 0;
    this.duration = 0;
  }

  private fail(id: number): void {
    if (this.playingId !== id) return;
    this.stop();
    if (!this.failed.includes(id)) this.failed = [...this.failed, id];
  }

  /** The playhead is data, so it follows the element every frame. */
  private tick = (): void => {
    if (!this.element || this.status !== "playing") return;
    this.position = this.element.currentTime;
    this.frame = requestAnimationFrame(this.tick);
  };

  /** The phone's lock screen shows what is playing. */
  private setMediaSession(title: string): void {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "SDRVIZ" });
    navigator.mediaSession.setActionHandler("play", () => void this.element?.play());
    navigator.mediaSession.setActionHandler("pause", () => this.element?.pause());
  }
}

export const player = new Player();
