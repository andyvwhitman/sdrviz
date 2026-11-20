import { AudioEngine } from "$lib/audio/engine";
import { onAudioFrame, sendOp } from "$lib/ws/connection";
import { gainOf, subscribedChannels, volumesOf, type Mix } from "../../screens/live-ops/mixer";
import { live } from "./live.svelte";
import { prefs } from "./prefs.svelte";

const MUTED_KEY = "sdrviz.audio.muted";

function savedMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Audio is on by default, and the glue between the mixer and the engine: while audio plays, the server is
 * asked for every audible channel and each AAR voice gets its mixer gain. Browsers refuse to play before
 * the first click or key press on the page, so the engine starts on that first gesture, wherever it lands.
 * The corner toggle (AudioToggle) mutes everything; that choice is remembered on this device.
 * Per-channel mute and solo live in `prefs`, so tiles, inspector and speakers always agree.
 */
class AudioStore {
  /** the user turned all audio off with the corner toggle */
  muted = $state(savedMuted());
  /** the page has had its first gesture, so the browser lets it play */
  unlocked = $state(false);
  /** audio is actually playing */
  enabled = $derived(this.unlocked && !this.muted);

  soloCount = $derived(prefs.solo.size);

  private engine = new AudioEngine();

  constructor() {
    onAudioFrame((frame) => this.engine.play(frame));
    if (typeof window !== "undefined") {
      window.addEventListener("pointerdown", this.unlock, true);
      window.addEventListener("keydown", this.unlock, true);
    }
    live.on("snapshot", () => this.subscribe()); // a reconnect is a new server client: ask again
    $effect.root(() => {
      $effect(() => this.subscribe());
    });
  }

  /** The first click, tap or key press anywhere: the browser now allows sound. */
  private unlock = (): void => {
    window.removeEventListener("pointerdown", this.unlock, true);
    window.removeEventListener("keydown", this.unlock, true);
    this.unlocked = true;
    if (!this.muted) this.engine.start();
  };

  /** Mute or unmute everything (the corner toggle). A click on it is itself the gesture that unlocks audio. */
  toggle(): void {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTED_KEY, this.muted ? "1" : "0");
    } catch {
      // not remembered
    }
    if (!this.unlocked) return; // the same click's unlock listener starts (or skips) the engine
    if (this.muted) this.engine.stop();
    else this.engine.start();
  }

  /** Lower the live audio while a recorded clip plays (the frequency page). */
  duck(on: boolean): void {
    this.engine.duck(on);
  }

  /** Tell the server which channels to stream and set each voice's gain. */
  private subscribe(): void {
    const channels = live.state?.channels ?? [];
    const mix: Mix = { muted: prefs.muted, solo: prefs.solo, volumes: volumesOf(prefs.value) };
    const ids = channels.map((channel) => channel.id);
    sendOp({ op: "audio", channels: this.enabled ? subscribedChannels(mix, ids) : [] });

    // Several frequencies can share one AAR frequency: the loudest setting wins.
    const gains = new Map<number, number>();
    for (const channel of channels) {
      const aar = Number.parseInt(channel.aar.replace(/\D/g, ""), 10);
      if (Number.isFinite(aar)) gains.set(aar, Math.max(gains.get(aar) ?? 0, gainOf(mix, channel.id)));
    }
    gains.forEach((gain, aar) => this.engine.setGain(aar, gain));
  }
}

export const audio = new AudioStore();
