/** Words and numbers for a node's link: quality (0-100) as a label and a 5-step meter, lag in ms or s. */

import type { NodeStatus } from "$lib/types/nodes";
import type { ChipKind } from "./chips";
import { BLANK } from "./fmt";

export type LinkLabel = "GOOD" | "FAIR" | "POOR";

export const LINK_STEPS = 5;

/** 70 and up is good, 40 and up fair. A node with no link has no quality: BLANK, not POOR. */
export function linkLabel(quality: number | null): LinkLabel | typeof BLANK {
  if (quality == null) return BLANK;
  if (quality >= 70) return "GOOD";
  return quality >= 40 ? "FAIR" : "POOR";
}

/** How many of the 5 meter steps are lit: 0 for no link, else 1 to 5 (a link of 1 still lights one). */
export function linkSteps(quality: number | null): number {
  if (quality == null || quality <= 0) return 0;
  return Math.min(LINK_STEPS, Math.ceil((quality / 100) * LINK_STEPS));
}

/** Lag as "240 ms", or "1.8 s" from one second up; BLANK when unknown. */
export function formatLag(ms: number | null): string {
  if (ms == null) return BLANK;
  if (Math.round(ms) < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Lag beyond this is flagged (it is audio that is late, not a fault). */
export const HIGH_LAG_MS = 1000;

export const isHighLag = (ms: number | null): boolean => ms != null && ms >= HIGH_LAG_MS;

/** The chip of a node state: ONLINE bright, PENDING neutral, OFFLINE and REVOKED dim. Never ember or red (decisions 7, 26). */
export const NODE_CHIP: Record<NodeStatus, ChipKind> = { ONLINE: "active", OFFLINE: "offline", PENDING: "armed", REVOKED: "offline" };
