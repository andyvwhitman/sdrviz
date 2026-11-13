/** The 24 h scrubber: airtime heat strip, hour ruler, range bracket, playhead, REC rail, FEEDS lane. */

import { hm } from "./geometry";
import { buildFeedsLane } from "./feedsLane";
import { line, snap, text, type Prim } from "./prims";
import type { FeedSpan, HistoryRow, Range, Summary } from "./types";

export const STRIP_X = 72;
const STRIP_H = 32;
const REC_Y = 64;
const FEEDS_Y = 84;

export interface ScrubberInput {
  width: number;
  /** 1440 stage: the date replaces the midnight label */
  small: boolean;
  summary: Summary;
  range: Range;
  now: number;
  /** sim date "2026-11-10" */
  date: string;
  pick: HistoryRow | null;
  /** playback position in the picked clip, 0..1 */
  progress: number;
  spans: FeedSpan[];
  diskFault: boolean;
}

export interface Scrubber {
  /** one ramp value (0..1) per strip pixel column */
  heat: number[];
  prims: Prim[];
}

/** Per-minute airtime as a 10 minute running mean, binned to pixel columns, so the strip reads as density. */
export function heatColumns(perMinute: number[], columns: number): number[] {
  if (!perMinute.length || columns <= 0) return [];
  const mean = perMinute.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let k = i - 4; k <= i + 5; k++) {
      if (k >= 0 && k < perMinute.length) {
        sum += perMinute[k];
        n++;
      }
    }
    return sum / n;
  });
  const max = Math.max(...mean);
  return Array.from({ length: columns }, (_, c) => {
    const a = Math.floor((c / columns) * perMinute.length);
    const b = Math.max(a + 1, Math.floor(((c + 1) / columns) * perMinute.length));
    const v = Math.max(...mean.slice(a, b));
    const t = max > 0 ? v / max : 0;
    return t > 0 ? 0.04 + 0.9 * t : 0;
  });
}

export function buildScrubber(input: ScrubberInput): Scrubber {
  const { width: W, small, summary, range, now, date, pick, progress } = input;
  const x0 = STRIP_X;
  const x1 = W;
  const t0 = summary.scrubber_start_t;
  const t1 = t0 + summary.scrubber_airtime_per_min.length * 60;
  const X = (t: number) => x0 + ((t - t0) / (t1 - t0)) * (x1 - x0);
  const y0 = 0;
  const y1 = STRIP_H;
  const prims: Prim[] = [
    { t: "rect", x: snap(x0), y: snap(y0), w: x1 - x0 - 1, h: y1 - y0 - 1, cls: "s-hair k-faint" },
    text(0, 13, "AIRTIME", "tx-lab"),
    text(0, 27, "10 MIN MEAN", "tx-lab"),
    // hour ruler: majors every hour (M2)
    line(x0, snap(y1), x1, snap(y1), "s-hair k-faint"),
  ];
  for (let t = Math.ceil(t0 / 900) * 900; t <= t1; t += 900) {
    const major = t % 3600 === 0;
    prims.push(line(snap(X(t)), y1, snap(X(t)), y1 + (major ? 8 : 4), "s-hair " + (major ? "k-line" : "k-faint")));
    if (!major) continue;
    const label = hm(t);
    const midnight = label === "00:00";
    // midnight carries the date; at 1440 the date replaces the label so it cannot touch 01:00
    prims.push(text(Math.round(X(t)), y1 + 20, small && midnight ? date.slice(5) : label, small && midnight ? "tx-lab" : "tx-num", "middle"));
    if (!small && midnight) prims.push(text(Math.round(X(t)) + 22, y1 + 20, date.slice(5).replace("-", "·"), "tx-lab"));
  }
  prims.push(text(0, y1 + 20, "24 H", "tx-lab"));

  // range bracket: M1 brackets as handles over the selected range
  const a = Math.round(X(range.start_t));
  const b = Math.round(X(range.end_t));
  prims.push({
    t: "path",
    d: `M${a + 8} ${y0 - 4}H${a}V${y1 + 4}H${a + 8}M${b - 8} ${y0 - 4}H${b}V${y1 + 4}H${b - 8}`,
    cls: "s-emph k-ink",
  });
  // playhead: 2 px ink line, 5 px downward triangle cap (playback, never orange)
  if (pick) {
    const px = Math.round(X(pick.t_offset_s + progress * pick.duration_s));
    prims.push(line(px, y0 - 1, px, y1, "hi-playhead"));
    prims.push({ t: "path", d: `M${px - 5} ${y0 - 7}H${px + 5}L${px} ${y0 - 1}Z`, cls: "hi-cap" });
  }

  // recording rail, 2 px (brief 8.9)
  prims.push(text(0, REC_Y + 4, "REC", "tx-lab"));
  prims.push(line(x0, REC_Y, x1, REC_Y, "hi-rec" + (input.diskFault ? " is-fault" : "")));
  if (input.diskFault) prims.push(text(x1, REC_Y - 6, "NOT RECORDING", "hi-fault-t", "end"));

  prims.push(...buildFeedsLane({ spans: input.spans, t0, t1, now, x0, x1, y: FEEDS_Y }));
  return { heat: heatColumns(summary.scrubber_airtime_per_min, x1 - x0), prims };
}
