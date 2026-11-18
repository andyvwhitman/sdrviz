import { api } from "$lib/api/client";
import type { Prefs } from "$lib/types/api";
import { live } from "./live.svelte";

/** REST-backed preferences with optimistic updates (mute, solo, record, volumes, active bank). */
class PrefsStore {
  value = $state<Prefs | null>(null);

  muted = $derived(new Set(this.value?.muted ?? []));
  solo = $derived(new Set(this.value?.solo ?? []));
  record = $derived(new Set(this.value?.record ?? []));

  constructor() {
    // The server announces bank and feed changes (from this tab, another tab or another device) with a
    // snapshot; reload so this copy never goes stale.
    live.on("snapshot", () => {
      if (this.value) this.load().catch((error) => console.warn("prefs not refreshed", error));
    });
  }

  async load(): Promise<void> {
    this.value = await api.prefs.get();
  }

  /** Apply `patch` immediately, send it, and roll back if the server refuses. */
  async update(patch: Partial<Prefs>): Promise<void> {
    const before = this.value;
    if (!before) return;
    this.value = { ...before, ...patch };
    try {
      this.value = await api.prefs.patch(patch);
    } catch (error) {
      this.value = before;
      throw error;
    }
  }

  /** Toggle membership of a channel in muted, solo or record. */
  toggle(list: "muted" | "solo" | "record", channelId: string): Promise<void> {
    const current = this.value?.[list] ?? [];
    const next = current.includes(channelId) ? current.filter((id) => id !== channelId) : [...current, channelId];
    return this.update({ [list]: next });
  }
}

export const prefs = new PrefsStore();
