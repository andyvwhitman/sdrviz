/**
 * FEEDS lane under the REC rail (spec 5.30, rev 2): the Stats feed-uptime vocabulary on the 24 h scrubber.
 * Solid line when healthy, dashed spans otherwise, past faults hollow, a fault now ends red with its glyph
 * at the now end. Ported from renderScrub in design/mockups/history.js.
 */

import { feedName } from "$lib/hud/roles";
import { line, snap, text, type Prim } from "./prims";
import type { FeedSpan } from "./types";

export interface FeedsLaneInput {
  spans: FeedSpan[];
  /** scrubber time span, seconds (24 h ending now) */
  t0: number;
  t1: number;
  now: number;
  /** strip x range and lane y */
  x0: number;
  x1: number;
  y: number;
}

/** A span with its pixel extent. */
interface Segment extends FeedSpan {
  a: number;
  b: number;
  px0: number;
  px1: number;
  /** x of the fault triangle, whole inside the lane */
  glyphX: number;
}

const CHAR = 6.7;
const spanClass = (s: FeedSpan) => "s-hair " + (s.state === "offline" ? "d-offline" : "d-stale") + " k-stale";

export function buildFeedsLane(input: FeedsLaneInput): Prim[] {
  const { t0, t1, now, x0, x1, y } = input;
  const X = (t: number) => x0 + ((t - t0) / (t1 - t0)) * (x1 - x0);
  const prims: Prim[] = [text(0, y + 4, "FEEDS", "tx-lab"), line(x0, snap(y), x1, snap(y), "s-hair k-line")];

  const isLive = (s: Segment) => s.active && s.b >= now - 1;
  const segments: Segment[] = [];
  for (const span of input.spans) {
    const a = Math.max(t0, span.start_t);
    const b = Math.min(now, span.end_t);
    if (b > t0 && a < t1) segments.push(placeSegment({ ...span, a, b: Math.max(b, a), px0: 0, px1: 0, glyphX: 0 }, X, x0, x1, (s) => isLive(s)));
  }
  const live = segments.filter(isLive).sort((p, q) => Number(q.state === "fault") - Number(p.state === "fault"));
  const past = segments.filter((s) => !isLive(s)).sort((p, q) => p.a - q.a);

  // a past span: hollow ticks and a dashed line over a 3 px void gap
  for (const s of past) {
    prims.push(line(s.px0 - 1, snap(y), s.px1 + 1, snap(y), "hi-gap"));
    prims.push(line(snap(s.px0), y - 4, snap(s.px0), y + 4, "s-hair k-stale"), line(snap(s.px1) - 1, y - 4, snap(s.px1) - 1, y + 4, "s-hair k-stale"));
    prims.push(line(s.px0, snap(y), s.px1, snap(y), spanClass(s)));
  }

  // past-fault triangles: faults on different feeds within 6 px share ONE hollow triangle (as they share a
  // label); its base sits 2 px above the tick band (ticks y +- 4), so a tick never crosses it
  const triangles: number[] = [];
  for (const s of past.filter((q) => q.state === "fault").sort((p, q) => p.glyphX - q.glyphX)) {
    const last = triangles[triangles.length - 1];
    if (last === undefined || s.glyphX - last > 6) triangles.push(s.glyphX);
  }
  for (const x of triangles) prims.push({ t: "glyph", cx: x, cy: y - 10, state: "fault-past" });

  for (const s of live) {
    const tick = s.state === "fault" ? "k-fault" : "k-stale";
    prims.push(line(s.px0 - 1, snap(y), s.px1, snap(y), "hi-gap"));
    prims.push(line(snap(s.px0), y - 4, snap(s.px0), y + 4, `s-hair ${tick}`), line(snap(s.px1) - 1, y - 4, snap(s.px1) - 1, y + 4, `s-hair ${tick}`));
    prims.push(s.state === "fault" ? line(s.px0, snap(y), s.px1, snap(y), "hi-bar-fault") : line(s.px0, snap(y), s.px1, snap(y), spanClass(s)));
  }
  // the live glyph at now (one per lane: fault outranks stale), drawn last so nothing covers it
  if (live.length) prims.push({ t: "glyph", cx: x1 - 6, cy: y - 2, state: live[0].state === "fault" ? "fault" : live[0].state === "offline" ? "offline" : "stale" });

  // live labels: one stacked block directly left of the now glyph, hung on a 1 px bracket leader that meets the
  // lane at the glyph. Two lines straddle the lane (above, then below); one line sits below. Present tense
  // stays at now, never beside a past event (P2).
  const taken: [number, number][] = [];
  if (live.length) {
    const lines = live.slice(0, 2).map((s) => ({ s: `${feedName(s.feed_id)} · ${s.label}`, cls: s.state === "fault" ? "hi-fault-t" : "hi-stale-t" }));
    const xr = x1 - 22;
    const xb = xr + 5;
    const ys = lines.length === 2 ? [y - 6, y + 12] : [y + 12];
    lines.forEach((l, k) => prims.push(text(xr, ys[k], l.s, l.cls, "end")));
    const yTop = ys[0] - 4;
    const yBottom = ys[ys.length - 1] - 4;
    prims.push({
      t: "path",
      d: `M${xb - 3} ${snap(Math.min(yTop, y))}H${snap(xb)}V${snap(Math.max(yBottom, y))}H${xb - 3}M${snap(xb)} ${snap(y)}H${x1 - 12}`,
      cls: "s-hair k-line",
    });
    // a second live line that is stale/offline gets its own glyph at the now end, level with its text line
    if (live.length > 1 && live[1].state !== "fault") {
      const gy = ys[1] - 4;
      const gx = x1 - 8;
      prims.push({ t: "path", d: `M${snap(xb)} ${snap(gy)}H${gx - 10}`, cls: "s-hair k-line" });
      prims.push({ t: "glyph", cx: gx, cy: gy, state: live[1].state === "offline" ? "offline" : "stale" });
    }
    const widest = Math.max(...lines.map((l) => l.s.length)) * CHAR;
    taken.push([xr - widest - 8, x1]);
  }

  // past labels: feed names on the row under the lane, beside their own span. Spans that start within 10 px
  // share one label; a past span that runs straight into a live one on the same feed is part of that live
  // incident and is named by the live block.
  const continuesLive = (s: Segment) => live.some((l) => l.feed_id === s.feed_id && s.b >= l.a - 60);
  const groups: { px0: number; names: string[] }[] = [];
  for (const s of past.filter((q) => !continuesLive(q)).sort((p, q) => p.px0 - q.px0)) {
    const last = groups[groups.length - 1];
    const name = feedName(s.feed_id);
    if (last && s.px0 - last.px0 <= 10) {
      if (!last.names.includes(name)) last.names.push(name);
    } else groups.push({ px0: s.px0, names: [name] });
  }
  // newest first, so the most recent event always keeps its name; an older label with no room beside its span
  // flips to the other side of it, and is dropped only if neither side is free
  for (const g of groups.reverse()) {
    const label = g.names.join(" · ");
    const w = label.length * CHAR;
    const free = (l: number, r: number) => l >= x0 && r <= x1 - 4 && taken.every(([a, b]) => r + 8 <= a || l >= b + 8);
    const tries: ["start" | "end", number, number, number][] = [
      ["start", g.px0, g.px0, g.px0 + w],
      ["end", g.px0 - 6, g.px0 - 6 - w, g.px0 - 6],
    ];
    const ok = tries.find(([, , l, r]) => free(l, r));
    if (ok) {
      prims.push(text(ok[1], y + 12, label, "tx-num", ok[0]));
      taken.push([ok[2], ok[3]]);
    }
  }
  return prims;
}

/** Pixel extent: every non-ok span at least 8 px, inside the lane, a span live now ends at now. */
function placeSegment(s: Segment, X: (t: number) => number, x0: number, x1: number, live: (s: Segment) => boolean): Segment {
  let a = Math.round(X(s.a));
  let b = Math.round(X(s.b));
  if (live(s)) {
    b = x1;
    a = Math.min(a, b - 8);
  }
  if (b - a < 8) {
    const mid = (a + b) / 2;
    a = Math.round(mid - 4);
    b = a + 8;
  }
  if (a < x0) {
    b += x0 - a;
    a = x0;
  }
  if (b > x1) {
    a -= b - x1;
    b = x1;
  }
  return { ...s, px0: a, px1: b, glyphX: Math.max(a, x0 + 6) };
}
