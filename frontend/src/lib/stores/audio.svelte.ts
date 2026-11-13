import { prefs } from "./prefs.svelte";

/**
 * Audio state for the header chip. The Web Audio engine (per-channel gains, PCM scheduling) arrives
 * with the kit audio package and replaces `enable()`; the chip and everything that reads `enabled`,
 * `soloCount` and `muted` keep working. Mute and solo live in `prefs`, so tiles and chip always agree.
 */
class AudioStore {
  /** a user gesture has enabled audio (browsers refuse to play before one) */
  enabled = $state(false);

  soloCount = $derived(prefs.solo.size);

  enable(): void {
    this.enabled = true;
  }

  toggle(): void {
    this.enabled = !this.enabled;
  }
}

export const audio = new AudioStore();
