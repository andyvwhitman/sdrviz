import { api } from "$lib/api/client";
import type { Recording } from "$lib/types/recordings";
import { backoffS } from "./frequency";

export const PAGE_SIZE = 50;
/** the most rows kept loaded; past this the foot points at the week grid */
export const MAX_ROWS = 1000;

/**
 * The log of one frequency: recordings newest first, paged with `before`. `fromHead` is true while the list starts
 * at the newest recording; a jump (a bucket, `?at=`) starts it further back, and then new rows do not join it.
 */
export class LogStore {
  rows = $state<Recording[]>([]);
  loading = $state(false);
  hasMore = $state(true);
  fromHead = $state(true);
  /** seconds until the next try after a failed load, or null */
  retryIn = $state<number | null>(null);
  /** rows that arrived while the viewer was reading further down; shown behind a "NEW" chip */
  incoming = $state<Recording[]>([]);

  private generation = 0;
  private attempt = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private controller: AbortController | undefined;

  constructor(readonly frequencyId: string) {}

  /** Replace the list, starting at the newest or just before `before`. */
  async load(before?: string): Promise<void> {
    this.generation += 1;
    this.rows = [];
    this.incoming = [];
    this.hasMore = true;
    this.fromHead = before === undefined;
    await this.fetchPage(before);
  }

  /** Append the next older page. */
  async more(): Promise<void> {
    if (this.loading || !this.hasMore || this.rows.length >= MAX_ROWS) return;
    await this.fetchPage(this.rows.at(-1)?.started_at);
  }

  private async fetchPage(before: string | undefined): Promise<void> {
    const generation = this.generation;
    this.loading = true;
    this.controller?.abort();
    this.controller = new AbortController();
    try {
      const page = await api.recordings.list({ frequency_id: this.frequencyId, before, limit: PAGE_SIZE }, this.controller.signal);
      if (generation !== this.generation) return;
      this.rows = [...this.rows, ...page.filter((rec) => !this.rows.some((have) => have.id === rec.id))];
      this.hasMore = page.length === PAGE_SIZE;
      this.attempt = 0;
      this.retryIn = null;
      this.loading = false;
    } catch (error) {
      if (generation !== this.generation || (error instanceof DOMException && error.name === "AbortError")) return;
      this.loading = false;
      this.scheduleRetry(() => void this.fetchPage(before));
    }
  }

  /** Refetch the newest page: rows already shown are updated in place (a transcript arrives), new ones join the top. */
  async refreshHead(holdNew: boolean): Promise<void> {
    try {
      const page = await api.recordings.list({ frequency_id: this.frequencyId, limit: PAGE_SIZE });
      const byId = new Map(page.map((rec) => [rec.id, rec]));
      this.rows = this.rows.map((rec) => byId.get(rec.id) ?? rec);
      if (!this.fromHead) return;
      const known = new Set([...this.rows, ...this.incoming].map((rec) => rec.id));
      const fresh = page.filter((rec) => !known.has(rec.id));
      if (holdNew) this.incoming = [...fresh, ...this.incoming];
      else if (fresh.length) this.rows = [...fresh, ...this.rows];
    } catch {
      // the next refresh tries again; the list on screen stays
    }
  }

  /** Bring the held rows into the list. */
  showIncoming(): void {
    this.rows = [...this.incoming, ...this.rows];
    this.incoming = [];
  }

  private scheduleRetry(run: () => void): void {
    clearInterval(this.timer);
    this.retryIn = backoffS(this.attempt);
    this.attempt += 1;
    this.timer = setInterval(() => {
      if (this.retryIn === null) return;
      this.retryIn -= 1;
      if (this.retryIn <= 0) {
        clearInterval(this.timer);
        this.retryIn = null;
        run();
      }
    }, 1000);
  }

  destroy(): void {
    this.generation += 1;
    clearInterval(this.timer);
    this.controller?.abort();
  }
}
