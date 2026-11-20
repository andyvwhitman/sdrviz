import { api } from "$lib/api/client";
import { withSlot } from "$lib/slots";
import type { Frequency, FrequencyBody, Slot } from "$lib/types/frequencies";

/** The frequency table, shared by the Frequencies page and the editor wherever it opens. Every change goes through here. */
class FrequencyStore {
  rows = $state.raw<Frequency[]>([]);
  /** the first load has answered, so an empty list means "none" and not "not loaded yet" */
  loaded = $state(false);
  failed = $state(false);

  async load(): Promise<void> {
    try {
      this.rows = await api.frequencies.table();
      this.loaded = true;
      this.failed = false;
    } catch {
      this.failed = true;
    }
  }

  byId = (id: string): Frequency | undefined => this.rows.find((f) => f.id === id);

  /** Put one frequency into the list, replacing the one with its id. */
  #put(frequency: Frequency): void {
    this.rows = this.rows.some((f) => f.id === frequency.id) ? this.rows.map((f) => (f.id === frequency.id ? frequency : f)) : [...this.rows, frequency];
  }

  /** Set one node's slot. The list changes at once; a refused request puts it back and throws. */
  async setSlot(id: string, feedId: string, slot: Slot): Promise<void> {
    const before = this.byId(id);
    if (!before) return;
    this.#put(withSlot(before, feedId, slot));
    try {
      this.#put(slot === "none" ? await api.frequencies.unassign(id, feedId) : await api.frequencies.assign(id, feedId, slot === "on"));
    } catch (error) {
      this.#put(before);
      throw error;
    }
  }

  async add(body: FrequencyBody): Promise<Frequency> {
    const saved = await api.frequencies.add(body);
    this.#put(saved);
    return saved;
  }

  async save(body: FrequencyBody): Promise<Frequency> {
    const saved = await api.frequencies.save(body);
    this.#put(saved);
    return saved;
  }

  async remove(id: string): Promise<void> {
    await api.frequencies.delete(id);
    this.rows = this.rows.filter((f) => f.id !== id);
  }
}

export const frequencies = new FrequencyStore();
