/**
 * Hero strip, off-bank and "on another feed" readouts, derived from the live state so they react
 * to the key-up deltas at once (the snapshot's `views[bank].hero` is only refreshed every 30 s).
 */

import { feedName } from "$lib/hud/roles";
import { cyclicAge } from "$lib/time";
import type { Channel, TxRow } from "$lib/types/live";

export type Hero =
  | { mode: "keyed"; aar4: string; label: string; via: string; elapsedS: number; othersLabel: string | null }
  | { mode: "idle"; aar: string; label: string; ageS: number }
  | { mode: "empty" }
  | { mode: "none" };

interface HeroInput {
  channels: readonly Channel[];
  active: readonly TxRow[];
  /** frequency ids of the active bank */
  bankIds: ReadonlySet<string>;
  now: number;
}

const keyedOnBank = (active: readonly TxRow[], bankIds: ReadonlySet<string>) =>
  active.filter((row) => bankIds.has(row.frequency_id)).sort((a, b) => a.t_offset_s - b.t_offset_s);

export function heroFor({ channels, active, bankIds, now }: HeroInput): Hero {
  if (bankIds.size === 0) return { mode: "empty" };
  const keyed = keyedOnBank(active, bankIds);
  if (keyed.length) {
    const [first, ...others] = keyed;
    const channel = channels.find((c) => c.id === first.frequency_id);
    return {
      mode: "keyed",
      aar4: first.aar4,
      label: first.label,
      via: channel?.tx?.via ?? feedName(first.feed_id),
      elapsedS: Math.max(0, cyclicAge(now, first.t_offset_s)),
      othersLabel: others.length ? `+${others.length} · ${others.map((row) => row.aar4).join(" · ")}` : null,
    };
  }
  const heard = channels
    .filter((c) => bankIds.has(c.id) && c.last_heard)
    .map((c) => ({ c, age: cyclicAge(now, c.last_heard!.end_t) }))
    .sort((a, b) => a.age - b.age)[0];
  if (!heard) return { mode: "none" };
  return { mode: "idle", aar: heard.c.aar, label: heard.c.label, ageS: heard.age };
}

/** "+1 OFF-BANK · 6666" for keyed channels outside the active bank, else null. */
export function offBankLabel(active: readonly TxRow[], bankIds: ReadonlySet<string>): string | null {
  const off = active.filter((row) => !bankIds.has(row.frequency_id));
  return off.length ? `+${off.length} OFF-BANK · ${off.map((row) => row.aar4).join(" · ")}` : null;
}

/** "+1 ON BAY-04": keyed channels the displayed feed does not receive, and the feed that does. */
export function elsewhereLabel(active: readonly TxRow[], displayedFeed: string, feedName: (id: string) => string): string | null {
  const missed = active.filter((row) => row.receptions?.length && !row.receptions.some((r) => r.feed_id === displayedFeed));
  if (!missed.length) return null;
  const via = new Set(missed.map((row) => feedName(row.receptions![0].feed_id)));
  return `+${missed.length} ON ${[...via].join(" · ")}`;
}
