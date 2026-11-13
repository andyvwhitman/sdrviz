import { params } from "$lib/params";
import { FORCED_DROP_AGE_S, linkStatus, type LinkStatus } from "$lib/ws/link";

/** How often the drop age is re-evaluated while the link is down. */
const TICK_MS = 500;

class LinkStore {
  hasData = $state(false);
  everLive = $state(false);
  /** performance.now() of the first failure of the current outage, null while healthy */
  private droppedAt = $state<number | null>(null);
  private now = $state(performance.now());
  private timer: ReturnType<typeof setInterval> | undefined;

  /** connecting | live | reconnecting | no-link */
  status = $derived<LinkStatus>(linkStatus({ hasData: this.hasData, everLive: this.everLive, dropAgeS: this.dropAgeS }));

  /** The status the shell shows: `?force=` (design review) overrides the real link. `loading` reads as connecting. */
  shownStatus = $derived<LinkStatus>(
    params.force === "loading" ? "connecting" : params.force === "connecting" || params.force === "reconnecting" || params.force === "no-link" ? params.force : this.status,
  );

  /** Drop age matching `shownStatus`: a forced state pretends to have one. */
  get shownDropAgeS(): number | null {
    const forced = params.force ? FORCED_DROP_AGE_S[params.force as LinkStatus] : undefined;
    return forced ?? this.dropAgeS;
  }

  /** Seconds since the link dropped; null while healthy. Drives the AGE readouts of the dimmed wall. */
  get dropAgeS(): number | null {
    return this.droppedAt == null ? null : Math.max(0, (this.now - this.droppedAt) / 1000);
  }

  /** The first snapshot arrived. */
  gotData(): void {
    this.hasData = true;
    this.everLive = true;
    this.droppedAt = null;
    this.stopTicking();
  }

  /** The socket closed (or never opened). */
  lost(): void {
    this.hasData = false;
    if (this.droppedAt == null) {
      this.now = performance.now();
      this.droppedAt = this.now;
    }
    this.timer ??= setInterval(() => (this.now = performance.now()), TICK_MS);
  }

  private stopTicking(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}

export const link = new LinkStore();
