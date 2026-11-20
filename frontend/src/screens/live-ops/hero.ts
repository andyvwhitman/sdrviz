/**
 * Hero strip and "on another node" readout, derived from the live state so they react to the key-up deltas at once.
 * The hero covers the listened node's channels (the snapshot has no hero of its own).
 */

import { feedName } from "$lib/hud/roles";
import { cyclicAge } from "$lib/time";
import type { Channel, TxRow } from "$lib/types/live";

export type Hero =
  | {
      mode: "keyed";
      /** the frequency id, so the name can select it */
      id: string;
      aar4: string;
      label: string;
      via: string;
      elapsedS: number;
      othersLabel: string | null;
      /** the other keyed channels of the node, for the "+2 · 0808 · 2828" items */
      others: { id: string; aar4: string }[];
    }
  | { mode: "idle"; aar: string; label: string; ageS: number }
  | { mode: "empty" }
  | { mode: "none" };

interface HeroInput {
  channels: readonly Channel[];
  active: readonly TxRow[];
  /** frequency ids of the listened node's channels */
  channelIds: ReadonlySet<string>;
  now: number;
}

const keyedOnNode = (active: readonly TxRow[], channelIds: ReadonlySet<string>) =>
  active.filter((row) => channelIds.has(row.frequency_id)).sort((a, b) => a.t_offset_s - b.t_offset_s);

export function heroFor({ channels, active, channelIds, now }: HeroInput): Hero {
  if (channelIds.size === 0) return { mode: "empty" };
  const keyed = keyedOnNode(active, channelIds);
  if (keyed.length) {
    const [first, ...others] = keyed;
    const channel = channels.find((c) => c.id === first.frequency_id);
    return {
      mode: "keyed",
      id: first.frequency_id,
      aar4: first.aar4,
      label: first.label,
      via: channel?.tx?.via ?? feedName(first.feed_id),
      elapsedS: Math.max(0, cyclicAge(now, first.t_offset_s)),
      others: others.map((row) => ({ id: row.frequency_id, aar4: row.aar4 })),
      othersLabel: others.length ? `+${others.length} · ${others.map((row) => row.aar4).join(" · ")}` : null,
    };
  }
  const heard = channels
    .filter((c) => channelIds.has(c.id) && c.last_heard)
    .map((c) => ({ c, age: cyclicAge(now, c.last_heard!.end_t) }))
    .sort((a, b) => a.age - b.age)[0];
  if (!heard) return { mode: "none" };
  return { mode: "idle", aar: heard.c.aar, label: heard.c.label, ageS: heard.age };
}

/** "+1 ON SDR-02": keyed channels the listened node does not receive, and the node that does (the first, to switch to). */
export function elsewhereLabel(
  active: readonly TxRow[],
  listenFeed: string,
  feedName: (id: string) => string,
): { text: string; feedId: string } | null {
  const missed = active.filter((row) => row.receptions?.length && !row.receptions.some((r) => r.feed_id === listenFeed));
  if (!missed.length) return null;
  const via = new Set(missed.map((row) => row.receptions![0].feed_id));
  return { text: `+${missed.length} ON ${[...via].map(feedName).join(" · ")}`, feedId: [...via][0] };
}
