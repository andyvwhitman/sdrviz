/**
 * The refresh rules of a frequency's log, shared by the full page and the Live Ops pane (call both from a component's
 * setup): refetch the head shortly after a key-up, poll while a transcript is pending, and tick the clock a day
 * strip and the "today" key are read from, noticing local midnight.
 */

import { untrack } from "svelte";
import type { ActivityStore } from "./activityStore.svelte";
import type { LogStore } from "./logStore.svelte";

export const REFRESH_AFTER_KEY_UP_MS = 2000;
export const PENDING_POLL_MS = 10_000;

export interface RefreshSource {
  store: () => LogStore | null;
  activity: () => ActivityStore | null;
  /** the frequency is keyed now */
  keyed: () => boolean;
  /** the reader is at the top of the log, so new rows may join without moving anything */
  attop: () => boolean;
  /** the day shown is today */
  isToday: () => boolean;
}

export function keepLogFresh(source: RefreshSource): void {
  let wasKeyed = false;
  // after a key-up the recording is on the server a moment later: refetch the head and today's strip
  $effect(() => {
    const now = source.keyed();
    if (wasKeyed && !now && source.store()) {
      const store = untrack(source.store)!;
      const timer = setTimeout(() => {
        void store.refreshHead(!untrack(source.attop));
        if (untrack(source.isToday)) void untrack(source.activity)?.loadDay(undefined);
      }, REFRESH_AFTER_KEY_UP_MS);
      wasKeyed = now;
      return () => clearTimeout(timer);
    }
    wasKeyed = now;
  });

  // a transcript arrives a minute or so after the audio: poll while a recent row still waits for it
  $effect(() => {
    const store = source.store();
    if (!store) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      if (store.rows.slice(0, 50).some((rec) => rec.transcript_state === "pending")) void store.refreshHead(!untrack(source.attop));
    }, PENDING_POLL_MS);
    return () => clearInterval(timer);
  });
}

/** A clock that ticks every second. `onNewDay` runs when `todayKey()` changes (local midnight). */
export function useDayClock(todayKey: () => string, onNewDay: () => void): { readonly nowMs: number } {
  let nowMs = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => {
      const before = untrack(todayKey);
      nowMs = Date.now();
      if (untrack(todayKey) !== before) onNewDay();
    }, 1000);
    return () => clearInterval(timer);
  });
  return {
    get nowMs() {
      return nowMs;
    },
  };
}
