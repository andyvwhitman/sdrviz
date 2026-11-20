/**
 * What Live Ops remembers on this device (direction 4.5), under one localStorage key: the two divider sizes as
 * fractions (null: the default), the tile density, the pane's day-strip lid, and the last selected frequency.
 * Every read and write is guarded, since storage can be blocked (private windows); the screen works without it.
 */

const KEY = "sdrviz.liveops.v1";

export type Density = "std" | "cmp";

interface Saved {
  /** the wall's share of the space under the hero, or null for the default */
  wall: number | null;
  /** the pane's share of the content width, or null for the default */
  pane: number | null;
  density: Density;
  /** the day-strip lid is open */
  strip: boolean;
  /** the frequency id that was selected when the screen was left */
  selected: string | null;
}

const DEFAULTS: Saved = { wall: null, pane: null, density: "std", strip: false, selected: null };

const fraction = (value: unknown): number | null => (typeof value === "number" && value > 0 && value < 1 ? value : null);

function read(): Saved {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && typeof raw === "object") {
      const saved = raw as Record<string, unknown>;
      return {
        wall: fraction(saved.wall),
        pane: fraction(saved.pane),
        density: saved.density === "cmp" ? "cmp" : "std",
        strip: saved.strip === true,
        selected: typeof saved.selected === "string" ? saved.selected : null,
      };
    }
  } catch {
    // unreadable or blocked: the defaults
  }
  return { ...DEFAULTS };
}

class LiveOpsPrefs {
  wall = $state<number | null>(null);
  pane = $state<number | null>(null);
  density = $state<Density>("std");
  strip = $state(false);
  selected = $state<string | null>(null);

  constructor() {
    Object.assign(this, read());
  }

  /** Remember the current values. Called on pointer-up and key steps, not on every pointer move. */
  save(): void {
    const { wall, pane, density, strip, selected } = this;
    try {
      localStorage.setItem(KEY, JSON.stringify({ wall, pane, density, strip, selected }));
    } catch {
      // not remembered
    }
  }
}

export const liveOpsPrefs = new LiveOpsPrefs();
