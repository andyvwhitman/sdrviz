import type { Prefs } from "$lib/types/api";

/**
 * Mute, solo, record and volumes: how this browser mixes the channels. They live in localStorage, not on the
 * server, so a mute on the phone leaves the laptop's speakers alone (decision 73).
 */

const KEY = "sdrviz.prefs.v1";

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v) => typeof v === "string") : []);

/** Saved prefs, tolerant of anything the storage holds; blocked storage gives the empty prefs. */
export function readPrefs(): Prefs {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && typeof raw === "object") {
      const saved = raw as Record<string, unknown>;
      const volume: Record<string, number> = {};
      for (const [id, v] of Object.entries((saved.volume as object | undefined) ?? {})) {
        if (typeof v === "number" && v >= 0 && v <= 1) volume[id] = v;
      }
      return { muted: strings(saved.muted), solo: strings(saved.solo), record: strings(saved.record), volume };
    }
  } catch {
    // unreadable or blocked: the empty prefs
  }
  return { muted: [], solo: [], record: [], volume: {} };
}

class PrefsStore {
  value = $state<Prefs>(readPrefs());

  muted = $derived(new Set(this.value.muted));
  solo = $derived(new Set(this.value.solo));
  record = $derived(new Set(this.value.record));

  /** Apply `patch` and remember it on this device. */
  update(patch: Partial<Prefs>): void {
    this.value = { ...this.value, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.value));
    } catch {
      // not remembered; it still holds for this page
    }
  }

  /** Toggle membership of a channel in muted, solo or record. */
  toggle(list: "muted" | "solo" | "record", channelId: string): void {
    const current = this.value[list];
    this.update({ [list]: current.includes(channelId) ? current.filter((id) => id !== channelId) : [...current, channelId] });
  }
}

export const prefs = new PrefsStore();
