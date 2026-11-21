/**
 * What Feeds remembers on this device: where the divider sits, as a fraction of the split (null: the default).
 * One value serves both tabs. Reads and writes are guarded, since storage can be blocked (private windows).
 */

import { validFraction } from "./split";

export const SPLIT_KEY = "sdrviz.feeds.split";

export function readSplit(): number | null {
  try {
    return validFraction(JSON.parse(localStorage.getItem(SPLIT_KEY) ?? "null"));
  } catch {
    return null; // unreadable or blocked: the default
  }
}

export function writeSplit(fraction: number | null): void {
  try {
    if (fraction === null) localStorage.removeItem(SPLIT_KEY);
    else localStorage.setItem(SPLIT_KEY, JSON.stringify(fraction));
  } catch {
    // not remembered
  }
}

class FeedsPrefs {
  split = $state<number | null>(readSplit());

  /** Remember the current split. Called when a drag ends or a key steps, not on every pointer move. */
  save(): void {
    writeSplit(this.split);
  }
}

export const feedsPrefs = new FeedsPrefs();
