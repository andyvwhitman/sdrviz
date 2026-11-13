/**
 * A smooth sim clock for readouts that count between the 1 Hz `tick` messages (key-up timers,
 * LAST ages). It extrapolates from the last server time at the sim speed, so a frozen sim
 * (speed 0) stays frozen.
 */

import { live } from "./live.svelte";

const FRAME_MS = 100;

class SimClock {
  /** seconds since sim midnight, advanced every 100 ms */
  now = $state(0);
  private base = 0;
  private baseAt = performance.now();

  /** Anchor on the server's time (each tick and snapshot). */
  sync(serverT: number): void {
    this.base = serverT;
    this.baseAt = performance.now();
    this.now = serverT;
  }

  /** Start extrapolating; returns the stop function. */
  start(): () => void {
    const id = setInterval(() => {
      this.now = this.base + ((performance.now() - this.baseAt) / 1000) * live.simSpeed;
    }, FRAME_MS);
    return () => clearInterval(id);
  }
}

export const simClock = new SimClock();
