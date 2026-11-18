import { api } from "$lib/api/client";
import type { DayActivity, WeekActivity } from "$lib/types/recordings";

const MINUTE_MS = 60_000;

/** The day and week activity of one frequency. A date of undefined is today (the server's today, in the corridor). */
export class ActivityStore {
  day = $state<DayActivity | null>(null);
  week = $state<WeekActivity | null>(null);
  failed = $state(false);

  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(readonly frequencyId: string) {}

  /** Show a day (undefined: today). The previous day stays on screen until the new one arrives. */
  async loadDay(date: string | undefined): Promise<void> {
    const generation = ++this.generation;
    try {
      const day = await api.activity.day(this.frequencyId, date);
      if (generation !== this.generation) return;
      this.day = day;
      this.failed = false;
    } catch {
      if (generation === this.generation) this.failed = true;
    }
  }

  async loadWeek(): Promise<void> {
    try {
      this.week = await api.activity.week(this.frequencyId);
    } catch {
      // the grid keeps what it had; the day strip says when the API is down
    }
  }

  /** Refetch on the minute, as a safety net for the live store (which tells us about key-ups sooner). */
  keepFresh(date: () => string | undefined): () => void {
    const tick = (): void => {
      this.timer = setTimeout(() => {
        if (!document.hidden) {
          void this.loadDay(date());
          void this.loadWeek();
        }
        tick();
      }, MINUTE_MS - (Date.now() % MINUTE_MS));
    };
    tick();
    return () => clearTimeout(this.timer);
  }

  destroy(): void {
    this.generation += 1;
    clearTimeout(this.timer);
  }
}
