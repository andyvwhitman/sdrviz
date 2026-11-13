/**
 * Layout of the channel membership table: two columns of 24 px rows, banked channels first and the
 * unbanked group at the end of the second column. Channels that share one frequency (161.070) sit
 * together under an M12 "SAME FREQ · DIFFERENT FEEDS" dimension note.
 */

import * as fmt from "$lib/hud/fmt";
import { feedName } from "$lib/hud/roles";
import type { Channel, Feed } from "$lib/types/live";
import { channelNumber } from "./look";

export const ROW_H = 24;

export type Item =
  | { kind: "row"; channel: Channel }
  | { kind: "note"; text: string }
  | { kind: "group"; count: number };

export interface Bracket {
  /** y centres of the two rows and the note, in column pixels */
  y1: number;
  y2: number;
  yNote: number;
}

export interface Column {
  items: Item[];
  brackets: Bracket[];
}

const byAar = (a: Channel, b: Channel): number => channelNumber(a) - channelNumber(b) || a.id.localeCompare(b.id);

/** "6464 LND-02 · 6464 BAY-04": each channel of the pair with the feed that hears it. */
function pairNote(pair: Channel[], feeds: Feed[]): string {
  return pair.map((c) => `${fmt.aar(channelNumber(c))} ${feedName(feeds.find((f) => f.hears.includes(c.id))?.id)}`).join(" · ");
}

function layoutColumn(channels: Channel[], shared: Channel[][], feeds: Feed[], unbanked: Channel[] | null): Column {
  const items: Item[] = [];
  const brackets: Bracket[] = [];
  let index = 1; // the head row
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    items.push({ kind: "row", channel });
    index++;
    const pair = shared.find((p) => p.includes(channel) && p.includes(channels[i + 1]));
    if (!pair) continue;
    items.push({ kind: "row", channel: channels[i + 1] });
    index++;
    i++;
    items.push({ kind: "note", text: pairNote(pair, feeds) });
    brackets.push({ y1: (index - 2) * ROW_H + 12, y2: (index - 1) * ROW_H + 12, yNote: index * ROW_H + 12 });
    index++;
  }
  if (unbanked) {
    items.push({ kind: "group", count: unbanked.length });
    unbanked.forEach((channel) => items.push({ kind: "row", channel }));
  }
  return { items, brackets };
}

/** `bankedIds`: every channel that is a member of at least one bank. */
export function membershipColumns(channels: Channel[], bankedIds: Set<string>, feeds: Feed[]): [Column, Column] {
  const banked = channels.filter((c) => bankedIds.has(c.id)).sort(byAar);
  const unbanked = channels.filter((c) => !bankedIds.has(c.id)).sort(byAar);
  const perColumn = Math.ceil((banked.length + unbanked.length + 2) / 2);

  const byMhz = new Map<number, Channel[]>();
  for (const c of channels) byMhz.set(c.freq_mhz, [...(byMhz.get(c.freq_mhz) ?? []), c]);
  const shared = [...byMhz.values()].filter((group) => group.length > 1);

  return [layoutColumn(banked.slice(0, perColumn), shared, feeds, null), layoutColumn(banked.slice(perColumn), shared, feeds, unbanked)];
}
