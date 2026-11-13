/** Header chips and status line, identical on every screen (spec 5.1, 5.20). */

import type { LiveState } from "$lib/types/live";
import type { GlyphState } from "./tile";

export type ChipKind = "nominal" | "active" | "armed" | "degraded" | "fault" | "acked" | "offline" | "tx" | "filter";

export interface ChipSpec {
  text: string;
  kind: ChipKind;
  glyph?: GlyphState;
  /** fault onset pulse */
  onset?: boolean;
}

type ChipState = Pick<LiveState, "header" | "faults" | "degraded" | "system" | "active_transmissions">;

/**
 * FEEDS (fault + glyph + onset | acked + glyph | degraded + stale glyph | nominal), ASR, DISK, HOST,
 * and, off Live Ops, the one orange KEYED chip (`txChip`).
 */
export function headerChips(state: ChipState, { txChip = false } = {}): ChipSpec[] {
  const { header, faults, degraded } = state;
  const chips: ChipSpec[] = [];

  if (faults.some((f) => !f.acked)) chips.push({ text: header.feeds_chip, kind: "fault", glyph: "fault", onset: true });
  else if (faults.length) chips.push({ text: header.feeds_chip, kind: "acked", glyph: "fault" });
  else if (header.feeds_chip_state === "stale" || degraded.length) chips.push({ text: header.feeds_chip, kind: "degraded", glyph: "stale" });
  else chips.push({ text: header.feeds_chip, kind: "nominal" });

  const decoder = state.system?.decoder ?? { state: "ok", queue: 0 };
  if (decoder.state === "ok") chips.push({ text: "ASR OK", kind: "nominal" });
  else if (decoder.state === "fault") chips.push({ text: header.asr_chip || "ASR FAULT", kind: "fault", glyph: "fault" });
  else chips.push({ text: header.asr_chip || `ASR BACKLOG ${decoder.queue}`, kind: "degraded" });

  if (header.disk_chip) chips.push({ text: header.disk_chip, kind: "degraded" });
  if (header.host_chip) chips.push({ text: header.host_chip, kind: "degraded" });

  const keyed = state.active_transmissions ?? [];
  if (txChip && keyed.length) {
    const onBank = keyed.filter((a) => !a.off_bank).map((a) => a.aar);
    const offBank = keyed.length - onBank.length;
    const parts = offBank ? [...onBank, `+${offBank} OFF-BANK`] : onBank;
    chips.push({ text: `KEYED · ${parts.join(" · ")}`, kind: "tx", glyph: "tx" });
  }
  return chips;
}

export type StatusTone = "c-fault" | "c-stale" | "c-ink-2";

export interface StatusSpec {
  /** per-item segments, joined by the separator dot */
  segments: { text: string; tone: StatusTone }[];
  /** the screen's own nominal readout, shown when no event is open */
  text?: string;
  /** colour the whole line fault red (an unacknowledged fault exists) */
  fault: boolean;
  /** acknowledged faults, counted on the right */
  acked: number;
}

const toneOf = (message: string): StatusTone =>
  /FAULT/.test(message) && !/ACK'D/.test(message) ? "c-fault" : /STALE|BACKLOG/.test(message) ? "c-stale" : "c-ink-2";

/**
 * Status line: unacked fault state-fault, stale state-stale, the rest ink-2; empty falls back to `fallback`.
 * `newestOnly` prints just the first (newest) entry, as the Feeds screen does.
 */
export function statusFrom(state: Pick<LiveState, "status_line" | "faults">, fallback?: string, { newestOnly = false } = {}): StatusSpec {
  const lines = newestOnly ? (state.status_line ?? []).slice(0, 1) : (state.status_line ?? []);
  if (!lines.length) return { segments: [], text: fallback, fault: false, acked: 0 };
  const faults = state.faults ?? [];
  return {
    segments: lines.map((text) => ({ text, tone: toneOf(text) })),
    fault: faults.some((f) => !f.acked),
    acked: faults.filter((f) => f.acked).length,
  };
}

/** The nominal readout Stats and History show when nothing is open. */
export function recordingReadout(system: LiveState["system"]): string {
  const latency = system.decoder.median_latency_s;
  return (
    `RECORDING · DISK ${Math.round(system.disk.pct)}% · DECODER QUEUE ${system.decoder.queue}` +
    (latency == null ? "" : ` · MEDIAN ${latency.toFixed(1)} S`)
  );
}
