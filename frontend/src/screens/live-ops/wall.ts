/**
 * Front wall arithmetic shared by the spectrum trace, waterfall, LOFAR strip and rulers
 * (port of the helpers in design/mockups/live-ops.js). Pure TS, no drawing.
 */

import { BAND, chToMhz } from "$lib/hud/band";
import { DEFAULT_NOISE_FLOOR_DBFS } from "$lib/hud/tile";
import type { Channel, Feed, TxRow } from "$lib/types/live";

/** "CH54" -> 54 */
export const channelNumber = (aar: string): number => Number(aar.replace(/\D/g, ""));

const BAND_WIDTH = BAND.hi - BAND.lo;

/** AAR band to plot x. The band edges sit on the first and last pixel. */
export const bandX = (mhz: number, width: number): number => ((mhz - BAND.lo) / BAND_WIDTH) * (width - 1);

/** One AAR slot (15 kHz) in plot pixels. */
export const slotWidth = (width: number): number => (BAND.step / BAND_WIDTH) * (width - 1);

/** Plot x back to MHz. */
export const xToMhz = (x: number, width: number): number => BAND.lo + (x / (width - 1)) * BAND_WIDTH;

/** Deterministic 0..1 hash, so noise is reproducible and does not shimmer between redraws. */
export function hash(a: number, b = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Narrowband FM occupied shape: attenuation in dB at a distance of `dk` kHz from the centre. */
export const nfmShape = (dk: number): number => (dk < 4 ? -dk * 0.35 : dk < 7 ? -1.4 - (dk - 4) * 4 : -13.4 - (dk - 7) * 7);

/** A carrier the displayed feed hears right now. */
export interface Carrier {
  channel: number;
  mhz: number;
  rssiDbfs: number;
  elapsedS: number;
}

/** Active transmissions received by `feedId`; nothing when the feed delivers no samples. */
export function carriersOn(active: readonly TxRow[], feedId: string, live: boolean): Carrier[] {
  if (!live) return [];
  return active.flatMap((row) => {
    const reception = row.receptions?.find((r) => r.feed_id === feedId);
    if (reception?.rssi_dbfs == null) return [];
    const channel = channelNumber(row.aar);
    return [{ channel, mhz: chToMhz(channel), rssiDbfs: reception.rssi_dbfs, elapsedS: row.elapsed_s ?? 0 }];
  });
}

/** The floor a feed reports now; the last one it reported while it is down; else the default. */
const lastFloor = new Map<string, number>();
export function noiseFloor(feed: Pick<Feed, "id" | "noise_floor_dbfs">): number {
  if (feed.noise_floor_dbfs != null) lastFloor.set(feed.id, feed.noise_floor_dbfs);
  return lastFloor.get(feed.id) ?? DEFAULT_NOISE_FLOOR_DBFS;
}

/** The channel numbers a feed hears, from channel ids. */
export function heardChannels(feed: Pick<Feed, "hears">, channels: readonly Channel[]): number[] {
  const byId = new Map(channels.map((c) => [c.id, c]));
  return feed.hears.flatMap((id) => (byId.has(id) ? [channelNumber(byId.get(id)!.aar)] : []));
}

/** Waterfall / LOFAR ramp clamp: just under the floor, just over the strongest signal in view. */
export function rampClamp(floor: number, strongest: number | null): { lo: number; hi: number } {
  return { lo: Math.floor(floor - 4), hi: Math.ceil(Math.max(strongest ?? -Infinity, floor + 30) + 2) };
}
