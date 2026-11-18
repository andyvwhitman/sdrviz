/** The node key, the text around it, and the new-node form's checks. The key itself is never stored anywhere. */

import type { NewNode } from "$lib/types/nodes";

/** The command the owner runs on the Pi. */
export const enrollCommand = (key: string): string => `sudo sdrviz-node enroll ${key}`;

export const KEY_DIR = "/etc/sdrviz-node/";

/** The file offered for download: `<node name>.sdrviz-key`, the content being the key line alone. */
export function keyFile(nodeName: string, key: string): { filename: string; content: string } {
  const stem = nodeName.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "node";
  return { filename: `${stem}.sdrviz-key`, content: key };
}

/** Whole hours left of a key at `now` (at least 1 while it is valid, 0 once expired). */
export function hoursLeft(expiresAt: string | null, now: number): number | null {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt) - now;
  return ms <= 0 ? 0 : Math.max(1, Math.ceil(ms / 3_600_000));
}

export interface NodeDraft {
  name: string;
  lat: string;
  lon: string;
  preset: string;
}

export type NodeDraftErrors = Partial<Record<"name" | "lat" | "lon", string>>;

export const emptyNodeDraft = (): NodeDraft => ({ name: "", lat: "", lon: "", preset: "banks" });

const inRange = (text: string, limit: number): boolean => text.trim() !== "" && Number.isFinite(Number(text)) && Math.abs(Number(text)) <= limit;

/** Field errors by name; empty when the draft can be sent. The same limits as the API (name 1-40, lat, lon). */
export function validateNodeDraft(draft: NodeDraft): NodeDraftErrors {
  const errors: NodeDraftErrors = {};
  if (!draft.name.trim()) errors.name = "Required";
  else if (draft.name.trim().length > 40) errors.name = "40 characters at most";
  if (!inRange(draft.lat, 90)) errors.lat = "-90 to 90";
  if (!inRange(draft.lon, 180)) errors.lon = "-180 to 180";
  return errors;
}

export const toNewNode = (draft: NodeDraft): NewNode => ({
  name: draft.name.trim(),
  location: { lat: Number(draft.lat), lon: Number(draft.lon) },
  preset: draft.preset,
});
