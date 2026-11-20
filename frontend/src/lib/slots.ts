/** Which of a frequency's nodes decode it: the slot of each node, and changing one. */

import type { Frequency, Slot } from "$lib/types/frequencies";

/** What one node does with a frequency. */
export const slotOf = (f: Frequency, feedId: string): Slot => {
  const found = f.assignments.find((a) => a.feed_id === feedId);
  return found ? (found.enabled ? "on" : "off") : "none";
};

/** The state with every node taken together: on if any node has it on, else off if any has it assigned. */
export const overallSlot = (f: Frequency): Slot => (f.assignments.some((a) => a.enabled) ? "on" : f.assignments.length ? "off" : "none");

/** The slot a click leads to: on goes off, off goes on, and unassigned is assigned and enabled. */
export const flipped = (slot: Slot): Exclude<Slot, "none"> => (slot === "on" ? "off" : "on");

/** The frequency with one node's slot changed, for the optimistic update. */
export function withSlot(f: Frequency, feedId: string, slot: Slot): Frequency {
  const others = f.assignments.filter((a) => a.feed_id !== feedId);
  if (slot === "none") return { ...f, assignments: others };
  const was = f.assignments.findIndex((a) => a.feed_id === feedId);
  const assignment = { feed_id: feedId, enabled: slot === "on" };
  return { ...f, assignments: was < 0 ? [...others, assignment] : f.assignments.map((a, i) => (i === was ? assignment : a)) };
}
