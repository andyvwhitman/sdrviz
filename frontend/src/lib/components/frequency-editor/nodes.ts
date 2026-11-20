/** The nodes a frequency can be assigned to: the feeds of the live snapshot (a node's assignments hang on its feed). */

import type { GlyphState } from "$lib/hud/tile";
import type { Feed } from "$lib/types/live";
import type { NodeColumn } from "$lib/types/frequencies";

export const nodeColumns = (feeds: Feed[]): NodeColumn[] => feeds.map((feed) => ({ feedId: feed.id, short: feed.short, state: feed.state }));

/** ONLINE, STALE or OFFLINE; a fault or a disabled feed counts as offline for this purpose. */
export const stateWord = (state: NodeColumn["state"]): string => (state === "ok" ? "ONLINE" : state === "stale" ? "STALE" : "OFFLINE");

export const glyphFor = (state: NodeColumn["state"]): GlyphState => (state === "ok" ? "idle" : state === "stale" ? "stale" : "offline");
