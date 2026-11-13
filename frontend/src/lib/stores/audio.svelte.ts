import { AudioEngine } from "$lib/audio/engine";
import { onAudioFrame, sendOp } from "$lib/ws/connection";
import { gainOf, subscribedChannels, volumesOf, type Mix } from "../../screens/live-ops/mixer";
import { live } from "./live.svelte";
import { prefs } from "./prefs.svelte";

/**
 * Audio on/off for the header chip, and the glue between the mixer and the engine: while audio is
 * on, the server is asked for every audible channel and each AAR voice gets its mixer gain.
 * Mute and solo live in `prefs`, so tiles, inspector, chip and speakers always agree.
 */
class AudioStore {
  /** a user gesture has enabled audio (browsers refuse to play before one) */
  enabled = $state(false);

  soloCount = $derived(prefs.solo.size);

  private engine = new AudioEngine();

  constructor() {
    onAudioFrame((frame) => this.engine.play(frame));
    live.on("snapshot", () => this.subscribe()); // a reconnect is a new server client: ask again
    $effect.root(() => {
      $effect(() => this.subscribe());
    });
  }

  enable(): void {
    this.engine.start();
    this.enabled = true;
  }

  toggle(): void {
    if (this.enabled) this.engine.stop();
    else this.engine.start();
    this.enabled = !this.enabled;
  }

  /** Tell the server which channels to stream and set each voice's gain. */
  private subscribe(): void {
    const channels = live.state?.channels ?? [];
    const mix: Mix = { muted: prefs.muted, solo: prefs.solo, volumes: volumesOf(prefs.value) };
    const ids = channels.map((channel) => channel.id);
    sendOp({ op: "audio", channels: this.enabled ? subscribedChannels(mix, ids) : [] });

    // Several bank channels can share one AAR frequency: the loudest setting wins.
    const gains = new Map<number, number>();
    for (const channel of channels) {
      const aar = Number.parseInt(channel.aar.replace(/\D/g, ""), 10);
      if (Number.isFinite(aar)) gains.set(aar, Math.max(gains.get(aar) ?? 0, gainOf(mix, channel.id)));
    }
    gains.forEach((gain, aar) => this.engine.setGain(aar, gain));
  }
}

export const audio = new AudioStore();
