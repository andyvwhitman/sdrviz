/**
 * Key-up choreography on the tiles and the log (spec 6.3), driven by the live state:
 * a channel that goes to TX gets `commit` for the 120 ms flash (the stylesheet runs the frame flash,
 * the AAR step-down and holds the timer back while the attribute is on); on release the tile keeps its
 * keyed look for t-settle (`held`), then settles to idle while a ghost frame retracts over t-settle;
 * a freshly decoded row reveals its words at 30 ms each (M24). Reduced motion skips all of it.
 */

import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { ui } from "$lib/stores/ui.svelte";
import type { Channel } from "$lib/types/live";

/** t-flash: the commit window. */
export const FLASH_MS = 120;
/** after release the tile holds its keyed look for t-settle, then settles over t-settle (spec 6.3, motion-keyup SETTLE) */
const SETTLE_MS = 400;
const REVEAL_MS_PER_WORD = 30;
const REVEAL_CAP_MS = 400;
/** older rows get no reveal (spec 6.8) */
const REVEAL_MAX_AGE_S = 60;

/** A released transmission as the tile keeps showing it during the hold. */
export interface HeldTx {
  /** the channel as it was while keyed */
  channel: Channel;
  /** the final duration, frozen */
  elapsed: number;
  /** the waveform envelope, frozen */
  env: [number, number][];
}

export class KeyupMotion {
  /** channels inside their 120 ms commit flash */
  committing = new SvelteSet<string>();
  /** released channels still shown as keyed */
  held = new SvelteMap<string, HeldTx>();
  private keyed = new Map<string, Channel>();
  private holdTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private primed = false;

  /**
   * `tileOf` finds the tile element of a channel, so the settle ghost can be laid over it;
   * `freeze` captures a keyed channel's duration and waveform at release.
   */
  constructor(
    private tileOf: (channelId: string) => Element | undefined = () => undefined,
    private freeze: (channel: Channel) => HeldTx = (channel) => ({ channel, elapsed: 0, env: [] }),
  ) {}

  /** Call whenever the channel list changes; flashes the channels that just went to TX and holds the ones just released. */
  observe(channels: readonly Channel[]): void {
    const animate = this.primed && ui.motion !== "reduced";
    const nowKeyed = new Map(channels.filter((c) => c.state === "tx").map((c) => [c.id, $state.snapshot(c) as Channel]));
    if (animate) {
      for (const id of nowKeyed.keys()) {
        if (this.held.has(id)) this.release(id); // keyed again inside the hold: the same transmission goes on
        else if (!this.keyed.has(id)) this.flash(id);
      }
      for (const [id, channel] of this.keyed) if (!nowKeyed.has(id)) this.hold(id, channel);
    }
    this.keyed = nowKeyed;
    this.primed = true;
  }

  /** Keep the released tile keyed for t-settle, then let it settle. */
  private hold(channelId: string, channel: Channel): void {
    this.held.set(channelId, this.freeze(channel));
    this.holdTimers.set(
      channelId,
      setTimeout(() => {
        this.release(channelId);
        this.settle(channelId);
      }, SETTLE_MS),
    );
  }

  private release(channelId: string): void {
    clearTimeout(this.holdTimers.get(channelId));
    this.holdTimers.delete(channelId);
    this.held.delete(channelId);
  }

  /** Ghost TX frame over the settling tile: it retracts over t-settle (CSS `lo-ghost`). */
  private settle(channelId: string): void {
    // the tile is idle on the next frame; the ghost goes on top of it
    requestAnimationFrame(() => {
      const tile = this.tileOf(channelId);
      if (!tile) return;
      const ghost = document.createElement("span");
      ghost.className = "frame lo-ghost";
      ghost.dataset.frame = "tx";
      tile.append(ghost);
      setTimeout(() => ghost.remove(), SETTLE_MS);
    });
  }

  private flash(channelId: string): void {
    this.committing.add(channelId);
    setTimeout(() => this.committing.delete(channelId), FLASH_MS);
  }
}

/** M24: hide the row's words, then show them one by one (30 ms each, 400 ms in total). */
export function revealWords(row: Element, ageS = 0): void {
  const words = [...row.querySelectorAll<HTMLElement>(".c-text .w")];
  if (ui.motion === "reduced" || ageS > REVEAL_MAX_AGE_S || !words.length) return;
  const step = Math.min(REVEAL_MS_PER_WORD, REVEAL_CAP_MS / words.length);
  words.forEach((word) => word.classList.add("is-hidden"));
  words.forEach((word, i) => setTimeout(() => word.classList.remove("is-hidden"), Math.round(i * step)));
}
