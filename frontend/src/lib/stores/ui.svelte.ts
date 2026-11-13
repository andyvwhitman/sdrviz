import { params, type MotionMode } from "$lib/params";

/** Per-viewer display settings changed from the header. */
class UiStore {
  motion = $state<MotionMode>(params.motion);
  /** show the clock in UTC instead of the sim zone (a click on any clock toggles every clock) */
  utc = $state(false);

  toggleMotion(): void {
    this.motion = this.motion === "reduced" ? "full" : "reduced";
    document.documentElement.dataset.motion = this.motion;
  }

  toggleUtc(): void {
    this.utc = !this.utc;
  }
}

export const ui = new UiStore();
