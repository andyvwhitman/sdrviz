import { api } from "$lib/api/client";
import type { Prefs } from "$lib/types/api";

/** REST-backed preferences with optimistic updates (mute, solo, record, volumes, active bank). */
class PrefsStore {
  value = $state<Prefs | null>(null);

  muted = $derived(new Set(this.value?.muted ?? []));
  solo = $derived(new Set(this.value?.solo ?? []));
  record = $derived(new Set(this.value?.record ?? []));

  async load(): Promise<void> {
    this.value = await api.prefs.get();
  }

  /** Apply `patch` immediately, send it, and roll back if the server refuses. */
  async update(patch: Partial<Prefs>): Promise<void> {
    const before = this.value;
    if (!before) return;
    const next = { ...before, ...patch };
    this.value = next;
    try {
      this.value = await api.prefs.put(next);
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
