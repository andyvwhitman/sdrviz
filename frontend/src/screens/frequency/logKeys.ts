/**
 * The log's keyboard, shared by the frequency page and the Live Ops pane: J/K move through rows, Space or Enter plays
 * the focused row, the arrows seek while a clip plays, C toggles continuous play, T goes to the newest, Esc steps back
 * one layer (stop playback, then clear a bucket jump).
 */

import type { Recording } from "$lib/types/recordings";
import { hasAudio } from "./frequency";
import { player } from "./player.svelte";

export interface LogKeyActions {
  /** move the focus to the next older (+1) or newer (-1) row */
  step: (direction: 1 | -1) => void;
  /** the row that has the focus, if any */
  focused: () => Recording | undefined;
  play: (rec: Recording) => void;
  toggleContinuous: () => void;
  /** back to the newest row of today */
  showToday: () => void;
  /** a bucket jump is showing */
  jumped: () => boolean;
  /** back to the newest row of the day shown */
  clearJump: () => void;
}

/** True when the key was one of the log's and has been handled (default prevented, propagation stopped). */
export function logKey(event: KeyboardEvent, actions: LogKeyActions): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return false;
  const key = event.key;
  const row = actions.focused();
  const handled = (): boolean => (event.preventDefault(), event.stopPropagation(), true);
  if (key === "Escape") {
    if (player.playingId !== null) return (player.stop(), handled());
    return actions.jumped() ? (actions.clearJump(), handled()) : false;
  }
  if (key === "j" || key === "J") return (actions.step(1), handled());
  if (key === "k" || key === "K") return (actions.step(-1), handled());
  if ((key === " " || key === "Enter") && row && (event.target as HTMLElement).closest("[data-rec]")) return (hasAudio(row) && actions.play(row), handled());
  if ((key === "ArrowLeft" || key === "ArrowRight") && player.playingId !== null) return (player.seekBy(key === "ArrowLeft" ? -1 : 1), handled());
  if (key === "c" || key === "C") return (actions.toggleContinuous(), handled());
  if (key === "t" || key === "T") return (actions.showToday(), handled());
  return false;
}
