/**
 * Channel tile state: the five-layer precedence of spec 5.5 (`resolveTile`) and the
 * glue from a LiveState channel to its inputs (`tileInputFrom`, from live-ops.js `tileState`).
 */

import type { Channel, CoverageState, Feed } from "$lib/types/live";
import * as fmt from "./fmt";

/** There is no squelch threshold in the sim; the mockups draw M17 at the feed noise floor + 8 dB. */
export const SQUELCH_OVER_FLOOR_DB = 8;
/** Fallback noise floor when a feed reports none. */
export const DEFAULT_NOISE_FLOOR_DBFS = -45;

export type TileVariant = "standard" | "compact" | "strip";
export type FrameState = "idle" | "squelch" | "tx" | "tx-flash" | "fault" | "stale" | "offline";
export type GlyphState = "idle" | "squelch" | "tx" | "stale" | "offline" | "fault" | "fault-past";

export interface TileInput {
  tx?: boolean;
  flash?: boolean;
  commit?: boolean;
  squelch?: boolean;
  elapsed?: number;
  fault?: { reason: string; acked: boolean; onset?: boolean } | null;
  coverage?: CoverageState;
  /** one boolean per feed that hears the channel: healthy or not */
  feeds?: boolean[];
  offlineLabel?: string;
  /** age of the oldest-fresh feed sample, for stale and reconnecting readouts */
  ageS?: number;
  /** seconds since the last key-up */
  lastS?: number | null;
  via?: string | null;
  selected?: boolean;
  muted?: boolean;
  solo?: boolean;
  reconnecting?: boolean;
  focused?: boolean;
  showLevers?: boolean;
  spark?: number[];
  meter?: { floor?: number | null; db?: number | null; peak?: number | null };
  levers?: { m?: boolean; s?: boolean; r?: boolean };
}

export interface TileIdentity {
  aar: number;
  label: string;
  mhz: number;
  railroad: string;
  use: string;
  /** shared-frequency suffix (M7), e.g. "BWI-03" */
  suffix?: string;
}

export interface ResolvedTile {
  frame: FrameState;
  glyph: GlyphState;
  ember: "recent" | "recent-dim" | null;
  status: { text: string; cls: "" | "is-dim" | "is-stale" };
  wash: boolean;
  reason: string;
  aria: string;
}

export function resolveTile(s: TileInput = {}, identity: Partial<TileIdentity> = {}): ResolvedTile {
  const fault = s.fault ?? null;
  const coverage = s.coverage ?? "ok";
  const unacked = fault != null && !fault.acked;

  let frame: FrameState = "idle";
  if (unacked) frame = "fault";
  else if (s.tx) frame = s.flash && !s.muted ? "tx-flash" : "tx";
  else if (s.squelch) frame = "squelch";
  else if (fault || coverage === "stale") frame = "stale"; // an acked fault drops to the dashed stale frame
  else if (coverage === "offline") frame = "offline";

  let glyph: GlyphState = "idle";
  if (fault) glyph = "fault";
  else if (s.tx) glyph = "tx";
  else if (s.squelch) glyph = "squelch";
  else if (coverage === "offline") glyph = "offline";
  else if (coverage === "stale") glyph = "stale";

  let ember: ResolvedTile["ember"] = null;
  if (!s.tx && s.lastS != null) ember = s.lastS < 120 ? "recent" : s.lastS < 600 ? "recent-dim" : null;

  let status: ResolvedTile["status"] = { text: "", cls: "" };
  if (s.tx) status = { text: "", cls: "" }; // the timer occupies the right zone
  else if (s.reconnecting) status = { text: `AGE ${fmt.age(s.ageS, "age")}`, cls: "is-stale" };
  else if (coverage === "offline") status = { text: s.offlineLabel || "NO FEEDS", cls: "is-stale" };
  else if (coverage === "stale") status = { text: `AGE ${fmt.age(s.ageS, "age")}`, cls: "is-stale" };
  else if (ember) status = { text: `LAST ${fmt.age(s.lastS)}`, cls: ember === "recent-dim" ? "is-dim" : "" };

  const words = [`Channel ${identity.aar ?? ""}`, identity.label ?? ""];
  if (fault) words.push(`fault, ${fault.reason.toLowerCase()}${fault.acked ? ", acknowledged" : ""}`);
  if (s.tx) words.push("transmitting", `${Math.floor(s.elapsed ?? 0)} seconds`);
  else if (s.squelch) words.push("squelch open");
  else if (coverage === "stale") words.push("stale");
  else if (coverage === "offline") words.push((s.offlineLabel || "no feeds").toLowerCase());
  if (s.via && (s.tx || ember)) words.push(`via ${s.via}`);
  if (coverage === "partial" && s.feeds) words.push(`${s.feeds.filter(Boolean).length} of ${s.feeds.length} feeds`);

  return {
    frame,
    glyph,
    ember,
    status,
    wash: frame === "fault" || frame === "tx" || frame === "tx-flash",
    reason: fault ? `FAULT · ${fault.reason}` : "",
    aria: words.filter(Boolean).join(", "),
  };
}

/** What `tileInputFrom` needs to know about the wall around a channel. */
export interface TileContext {
  feeds: Record<string, Feed>;
  displayedFeed: string;
  /** noise floor of a feed when it reports none now */
  nominalFloor?: (feedId: string) => number | null;
  selectedId?: string | null;
  muted?: ReadonlySet<string>;
  solo?: ReadonlySet<string>;
  /** backend link dropped: values freeze and readouts show AGE from the drop */
  linkDropAgeS?: number | null;
}

const OFFLINE_READOUT = /NO FEEDS|RECONNECTING|DISABLED/;

/** Build the resolveTile input for one channel of a LiveState. */
export function tileInputFrom(c: Channel, ctx: TileContext): TileInput {
  const healthyFeeds = c.coverage.pips.filter((p) => p.state === "ok").map((p) => p.feed_id);
  const meterFeed = healthyFeeds.includes(ctx.displayedFeed) ? ctx.displayedFeed : healthyFeeds[0];
  const floor = (feedId: string) => ctx.feeds[feedId]?.noise_floor_dbfs ?? ctx.nominalFloor?.(feedId) ?? DEFAULT_NOISE_FLOOR_DBFS;

  const input: TileInput = {
    tx: c.state === "tx",
    squelch: c.state === "squelch",
    elapsed: c.tx?.elapsed_s ?? 0,
    fault: c.channel_fault
      ? { reason: c.channel_fault.reason || c.channel_fault.label || "", acked: !!c.channel_fault.acked, onset: c.channel_fault.onset }
      : null,
    coverage: c.coverage.state,
    feeds: c.coverage.pips.map((p) => p.state === "ok"),
    offlineLabel: c.status_readout && OFFLINE_READOUT.test(c.status_readout) ? c.status_readout : undefined,
    lastS: c.last_heard?.age_s ?? null,
    via: c.tx ? c.tx.via : (c.last_heard?.via ?? null),
    spark: c.spark_60m,
    selected: ctx.selectedId === c.id,
    muted: ctx.muted?.has(c.id),
    solo: ctx.solo?.has(c.id),
    meter: { floor: meterFeed ? floor(meterFeed) : null },
  };

  if (c.coverage.state === "stale") {
    input.ageS = Math.min(...c.coverage.pips.map((p) => ctx.feeds[p.feed_id]?.last_sample_age_s ?? 0));
  }
  if (c.tx) {
    // M16 level: the primary reception, with the loudest reception as the peak
    const primary = c.tx.receptions.find((r) => r.feed_id === c.tx!.primary_feed) ?? c.tx.receptions[0];
    input.meter!.db = primary?.rssi_dbfs ?? null;
    input.meter!.peak = Math.max(...c.tx.receptions.map((r) => r.rssi_dbfs ?? -Infinity));
  }
  if (ctx.linkDropAgeS != null) {
    Object.assign(input, { reconnecting: true, ageS: ctx.linkDropAgeS, lastS: null });
  }
  return input;
}

/** M7 shared-frequency suffix: two channels on one frequency, this one heard by a single feed. */
export function sharedFrequencySuffix(c: Channel, all: Channel[], feedLabel: (id: string) => string): string {
  const twin = all.some((o) => o.id !== c.id && o.freq_mhz === c.freq_mhz);
  return twin && c.heard_by.length === 1 ? feedLabel(c.heard_by[0]) : "";
}

export function identityFrom(c: Channel, suffix = ""): TileIdentity {
  return { aar: fmt.channelNumber(c.aar), label: c.label, mhz: c.freq_mhz, railroad: c.railroad, use: c.use, suffix };
}
