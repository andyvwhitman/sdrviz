/**
 * What Live Ops remembers on this device (direction 4.5), under one localStorage key: the two divider sizes as
 * fractions (null: the default), the pane's day-strip lid, and the last selected frequency.
 * Every read and write is guarded, since storage can be blocked (private windows); the screen works without it.
 *
 * Sprint 6 made two tiles wide the default, so pane widths saved before it (key `v1`) are discarded once: the first
 * read under `v2` takes the old wall, strip and selection and leaves the pane at its new default.
 */

const KEY = "sdrviz.liveops.v2";
const OLD_KEY = "sdrviz.liveops.v1";

interface Saved {
  /** the wall's share of the space under the hero, or null for the default */
  wall: number | null;
  /** the pane's share of the content width, or null for the default */
  pane: number | null;
  /** the day-strip lid is open */
  strip: boolean;
  /** the frequency id that was selected when the screen was left */
  selected: string | null;
}

const DEFAULTS: Saved = { wall: null, pane: null, strip: false, selected: null };

const fraction = (value: unknown): number | null => (typeof value === "number" && value > 0 && value < 1 ? value : null);

function parse(raw: string | null, keepPane: boolean): Saved | null {
  const saved: unknown = JSON.parse(raw ?? "null");
  if (!saved || typeof saved !== "object") return null;
  const fields = saved as Record<string, unknown>;
  return {
    wall: fraction(fields.wall),
    pane: keepPane ? fraction(fields.pane) : null,
    strip: fields.strip === true,
    selected: typeof fields.selected === "string" ? fields.selected : null,
  };
}

function read(): Saved {
  try {
    return parse(localStorage.getItem(KEY), true) ?? parse(localStorage.getItem(OLD_KEY), false) ?? { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS }; // unreadable or blocked: the defaults
  }
}

class LiveOpsPrefs {
  wall = $state<number | null>(null);
  pane = $state<number | null>(null);
  strip = $state(false);
  selected = $state<string | null>(null);

  constructor() {
    Object.assign(this, read());
  }

  /** Remember the current values. Called on pointer-up and key steps, not on every pointer move. */
  save(): void {
    const { wall, pane, strip, selected } = this;
    try {
      localStorage.setItem(KEY, JSON.stringify({ wall, pane, strip, selected }));
    } catch {
      // not remembered
    }
  }
}

export const liveOpsPrefs = new LiveOpsPrefs();
