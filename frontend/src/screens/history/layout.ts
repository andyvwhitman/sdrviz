/**
 * Stringline layout (M19): turns the loaded rows and trains into drawing primitives. Pure, so it is tested
 * without a browser. Ported from renderString in design/mockups/history.js; the comments say why each rule exists.
 *
 * Plot: X = route miles across the viewport, Y = time downward. The margin rail (rows with no string) sits
 * left of the time axis, the MP ruler under the plot.
 */

import { blockGeometry, type Direction } from "$lib/hud/dataBlock";
import * as fmt from "$lib/hud/fmt";
import {
  equationIndex,
  hm,
  miAtPrefix,
  mpAt,
  mpAtPrefix,
  mpLabel,
  shortName,
  trainMi,
  viewport,
} from "./geometry";
import { line, regMark, snap, text, type Prim } from "./prims";
import type { HistoryRow, Range, Route, RoutePoint, Train } from "./types";

export interface StringlineInput {
  route: Route;
  rows: HistoryRow[];
  trains: Train[];
  range: Range;
  /** sim clock for the NOW line; null for a range that is not live */
  now: number | null;
  tz: string;
  selectedTrain: string | null;
  pick: HistoryRow | null;
  /** the picked row's place on this route (for its MP) */
  pickPoint: RoutePoint | null;
  width: number;
  height: number;
}

export interface Stringline {
  /** plot box and ruler row, for the playback cursor */
  px0: number;
  px1: number;
  py0: number;
  py1: number;
  /** y of the time t */
  y: (t: number) => number;
  /** where the selected transmission is at time t: on its string, or on its rail tick; null when neither shows */
  notch: (t: number) => { x: number; y: number } | null;
  /** click targets: every tick, diamond and rail tick */
  hits: { id: string; x: number; y: number; title: string }[];
  /** drawn under the clipped plot */
  before: Prim[];
  /** strings, ticks and diamonds, clipped to the plot */
  plot: Prim[];
  /** selection, data block, labels, now line */
  after: Prim[];
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const RAIL_W = 168;
const CHAR = 6.7;

export function buildStringline(input: StringlineInput): Stringline {
  const { route, rows, trains, range, now, tz, selectedTrain, pick, pickPoint, width: W, height: H } = input;
  const custom = !range.live;
  const [v0, v1] = viewport(route);
  const px0 = 248;
  const px1 = W - 1;
  const py0 = 56;
  const py1 = H - 40;
  const { start_t: t0, end_t: t1 } = range;
  const X = (mi: number) => px0 + ((mi - v0) / (v1 - v0)) * (px1 - px0);
  const Y = (t: number) => py0 + ((t - t0) / (t1 - t0)) * (py1 - py0);
  const trainsById = Object.fromEntries(trains.map((tr) => [tr.train_id, tr]));

  const hits: Stringline["hits"] = [];
  const before: Prim[] = [];
  const plot: Prim[] = [];
  const after: Prim[] = [];

  // graticule: station verticals and 10-minute horizontals in grid tone (M3)
  const seen = new Set<string>();
  const stations = route.points
    .filter((p) => p.route_mi >= v0 - 0.01 && p.route_mi <= v1 + 0.01 && ["station", "interlocking", "yard"].includes(p.kind))
    .filter((p) => !seen.has(p.place_id) && !!seen.add(p.place_id));
  for (const p of stations) before.push(line(snap(X(p.route_mi)), py0, snap(X(p.route_mi)), py1, "s-hair k-grid"));
  for (let t = Math.ceil(t0 / 600) * 600; t <= t1; t += 600) before.push(line(px0, snap(Y(t)), px1, snap(Y(t)), "s-hair k-grid"));
  before.push({ t: "rect", x: snap(px0), y: snap(py0), w: px1 - px0 - 1, h: py1 - py0, cls: "s-hair k-faint" });
  before.push(...regMark(px0, py0));

  // station names above the plot, staggered into two rows when they would touch
  const lastEnd = [-1e9, -1e9];
  for (const p of stations) {
    const name = shortName(p);
    const x = X(p.route_mi);
    const w = name.length * 7.4;
    const anchor = x + w / 2 > px1 ? "end" : x - w / 2 < px0 - 40 ? "start" : "middle";
    const left = anchor === "end" ? px1 - w : anchor === "start" ? x - 4 : x - w / 2;
    const row = left > lastEnd[0] + 12 ? 0 : left > lastEnd[1] + 12 ? 1 : 0;
    lastEnd[row] = left + w;
    const ty = row === 0 ? 30 : 16;
    const tx = Math.round(anchor === "end" ? px1 : anchor === "start" ? x - 4 : x);
    before.push(text(tx, ty, name, "hi-stn" + (p.mp_approx ? " is-dim" : ""), anchor));
    before.push(line(snap(x), ty + 4, snap(x), py0, "s-hair k-faint"));
  }

  // MP ruler under the plot: native MP, majors every 5, minors every 1 (M2)
  const prefix = mpAt(route, (v0 + v1) / 2)?.prefix;
  const ry = py1 + 1;
  before.push(line(px0, snap(ry), px1, snap(ry), "s-hair k-faint"));
  if (prefix) {
    const mA = mpAtPrefix(route, prefix, v0) ?? 0;
    const mB = mpAtPrefix(route, prefix, v1) ?? 0;
    for (let m = Math.ceil(Math.min(mA, mB)); m <= Math.floor(Math.max(mA, mB)); m++) {
      const mi = miAtPrefix(route, prefix, m);
      if (mi == null || mi < v0 || mi > v1) continue;
      const major = m % 5 === 0;
      before.push(line(snap(X(mi)), ry, snap(X(mi)), ry + (major ? 8 : 4), "s-hair " + (major ? "k-line" : "k-faint")));
      if (major) before.push(text(Math.round(X(mi)), ry + 20, `${prefix} ${m}`, "tx-num", "middle"));
    }
  }
  // MP equation at the change of count, if inside or at the viewport edge
  const eq = equationIndex(route);
  if (eq > 0) {
    const a = route.points[eq - 1];
    const b = route.points[eq];
    if (b.route_mi >= v0 - 0.01 && b.route_mi <= v1) {
      const x = Math.round(X(b.route_mi));
      before.push(text(x + 6, ry + 34, `${a.prefix}≈ | ${b.prefix} ${b.mp!.toFixed(1)}`, "tx-num"));
      before.push(line(snap(x), ry, snap(x), ry + 26, "s-hair k-line"));
    }
  }
  before.push(text(px1, ry + 34, `TRACK MILES · NATIVE MP · ${(v1 - v0).toFixed(1)} MI IN VIEW`, "tx-lab", "end"));

  // time axis (down = later). A label gives way only to the NOW label.
  const nowY = now == null ? null : Y(now);
  for (let t = Math.ceil(t0 / 300) * 300; t <= t1; t += 300) {
    const y = snap(Y(t));
    const major = t % 600 === 0;
    before.push(line(px0 - (major ? 8 : 4), y, px0, y, "s-hair " + (major ? "k-line" : "k-faint")));
    if (major && (nowY == null || Math.abs(Y(t) - nowY) > 14)) before.push(text(px0 - 12, Math.round(Y(t)) + 4, hm(t), "tx-num", "end"));
  }
  before.push(text(px0 - 12, py0 - 8, tz, "tx-lab", "end"));

  // margin rail: everything with no string or located diamond, grouped by channel (M19)
  const railRows = rows.filter((r) => r.onRoute && r.kind === "rail");
  const lanes = [...new Set(railRows.map((r) => r.aar))].sort();
  const laneW = Math.min(32, Math.floor(RAIL_W / Math.max(1, lanes.length)));
  let railPick: { x: number; y: number } | null = null;
  before.push(text(0, 16, "MARGIN RAIL", "tx-lab"));
  before.push(text(0, 30, `${railRows.length} TX · NO STRING · BY CH`, "tx-num"));
  lanes.forEach((aar, i) => {
    const cx = i * laneW + laneW / 2;
    before.push(line(snap(cx), py0, snap(cx), py1, "hi-lane"));
    before.push(text(Math.round(cx), py0 - 8, aar.replace("CH", ""), "tx-num2 hi-lane-num", "middle"));
    for (const r of railRows.filter((q) => q.aar === aar)) {
      const y = snap(Y(r.t_offset_s));
      const selected = r.id === pick?.id;
      before.push(line(Math.round(cx - 6), y, Math.round(cx + 6), y, "hi-tick" + (selected ? " is-sel" : "")));
      hits.push({ id: r.id, x: cx, y: Y(r.t_offset_s), title: hitTitle(r) });
      if (selected) railPick = { x: Math.round(cx), y: Math.round(Y(r.t_offset_s)) };
    }
  });
  if (!lanes.length) before.push(text(0, py0 + 16, "NONE IN RANGE", "tx-num"));

  // strings
  const strings = trains.filter((t) => t.routes.includes(route.id));
  const labels: { id: string; sel: boolean; dir: string; anchors: [number, number][] }[] = [];
  const polys: [number, number][][] = []; // every line a label must not sit on, in screen px
  for (const tr of strings) {
    const xy = tr.stops.filter((p) => p.route_id === route.id).map((p): [number, number] => [X(p.route_mi), Y(p.t)]);
    const sel = tr.train_id === selectedTrain;
    plot.push({ t: "path", d: "M" + xy.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L"), cls: sel ? "s-active k-select" : "s-hair k-line" });
    polys.push(xy);
    // candidate label anchors: points along the string's in-view stretch, entry first
    const anchors: [number, number][] = [];
    for (let t = Math.max(t0, tr.start_t); t <= Math.min(t1, tr.end_t); t += 20) {
      const mi = trainMi(tr, t);
      if (mi != null && mi >= v0 && mi <= v1) anchors.push([X(mi), Y(t)]);
    }
    if (anchors.length) labels.push({ id: tr.train_id, sel, dir: tr.direction, anchors });
  }
  if (!custom && now != null) polys.push([[px0, Y(now)], [px1, Y(now)]]);

  // ticks: perpendicular 6 px on the string; detector diamonds at the detector's MP
  const off: { side: "l" | "r"; y: number; row: HistoryRow }[] = [];
  const ticks: Prim[] = [];
  for (const r of rows.filter((q) => q.onRoute && q.kind !== "rail" && q.mi != null)) {
    const mi = r.mi!;
    const x = X(mi);
    const y = Y(r.t_offset_s);
    if (mi < v0 || mi > v1) {
      off.push({ side: mi < v0 ? "l" : "r", y, row: r });
      continue;
    }
    hits.push({ id: r.id, x, y, title: hitTitle(r) });
    if (r.kind === "det") {
      plot.push({ t: "path", d: `M${x.toFixed(1)} ${(y - 5).toFixed(1)}l5 5l-5 5l-5 -5z`, cls: "hi-diamond" });
      continue;
    }
    const tr = trainsById[r.train_id ?? ""];
    const mA = (tr && trainMi(tr, r.t_offset_s - 30)) ?? mi;
    const mB = (tr && trainMi(tr, r.t_offset_s + 30)) ?? mi;
    let dx = X(mB) - X(mA);
    let dy = Y(r.t_offset_s + 30) - Y(r.t_offset_s - 30);
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    // M19: 6 px perpendicular tick in ink, cut into the string by a 2 px bg-void gap each side
    const d = `M${(x - dy * 3).toFixed(1)} ${(y + dx * 3).toFixed(1)}L${(x + dy * 3).toFixed(1)} ${(y - dx * 3).toFixed(1)}`;
    ticks.push({ t: "path", d, cls: "hi-tick-gap" }, { t: "path", d, cls: "hi-tick" + (r.train_id === selectedTrain ? " is-sel" : "") });
  }
  plot.push(...ticks);

  // off-view chevrons: the transmission is on this route, outside the viewport
  for (const o of off) {
    const x = o.side === "l" ? px0 + 6 : px1 - 6;
    const y = Math.round(o.y);
    const d = o.side === "l" ? 4 : -4;
    after.push({ t: "path", d: `M${x + d} ${y - 4}L${x} ${y}L${x + d} ${y + 4}`, cls: "hi-chev" });
  }
  const offLeft = off.filter((o) => o.side === "l").length;
  const offRight = off.length - offLeft;
  if (offLeft) after.push(text(px0 + 16, py0 + 14, `◂ ${offLeft} OFF VIEW`, "tx-num"));
  if (offRight) after.push(text(px1 - 16, py0 + 14, `${offRight} OFF VIEW ▸`, "tx-num", "end"));

  // label placement: boxes already taken, and how many string samples fall in a box
  const boxes: Box[] = [
    { x0: px0, x1: px0 + 120, y0: py0, y1: py0 + 20 },
    { x0: px1 - 120, x1: px1, y0: py0, y1: py0 + 20 },
  ];
  const hitsLines = (q: Box) => {
    let n = 0;
    for (const pl of polys) {
      for (let i = 1; i < pl.length; i++) {
        const [ax, ay] = pl[i - 1];
        const [bx, by] = pl[i];
        if (Math.max(ax, bx) < q.x0 || Math.min(ax, bx) > q.x1 || Math.max(ay, by) < q.y0 || Math.min(ay, by) > q.y1) continue;
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
        for (let k = 0; k <= steps; k++) {
          const x = ax + ((bx - ax) * k) / steps;
          const y = ay + ((by - ay) * k) / steps;
          if (x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1) {
            n++;
            break;
          }
        }
      }
    }
    return n;
  };
  const hitsBoxes = (q: Box) => boxes.filter((b) => q.x0 < b.x1 && q.x1 > b.x0 && q.y0 < b.y1 && q.y1 > b.y0).length;
  const inPlot = (q: Box) => q.x0 >= px0 + 4 && q.x1 <= px1 - 4 && q.y0 >= py0 + 2 && q.y1 <= py1 - 2;
  const pad = (q: Box, p: number): Box => ({ x0: q.x0 - p, x1: q.x1 + p, y0: q.y0 - p, y1: q.y1 + p });

  // selected tick: data block (M8), placed first in the quadrant with the fewest lines through it
  if (pick) {
    const tickIn = pick.mi != null && pick.mi >= v0 && pick.mi <= v1 && pick.kind !== "rail";
    const mp = pickPoint ? pickPoint.mp_label.replace("≈", "≈ ") : fmt.mp(mpLabel(route, pick.mi ?? 0));
    const l1 = fmt.trainId(pick.train_id || pick.speaker);
    const l2 = `${mp} · ${pick.aar}`;
    const bracket = (x: number, y: number): Prim => {
      const r0 = 10;
      const a = 4;
      const d = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const)
        .map(([sx, sy]) => `M${x + sx * r0} ${y + sy * (r0 - a)}V${y + sy * r0}H${x + sx * (r0 - a)}`)
        .join("");
      return { t: "path", d, cls: "s-emph k-select" };
    };
    const blockBox = (x: number, y: number, dir: Direction, len: number, l2s: string): Box => {
      const g = blockGeometry({ x, y, dir, len, l1, l2: l2s, sim: pick.sim }, (s) => s.length * CHAR);
      return { x0: g.box.x0 + 2, x1: g.box.x1 - 2, y0: g.box.y0 + 2, y1: g.box.y1 };
    };
    if (tickIn) {
      const x = Math.round(X(pick.mi!));
      const y = Math.round(Y(pick.t_offset_s));
      const dirs: Direction[] = ["ne", "se", "nw", "sw"];
      const best = dirs
        .map((dir, i) => {
          const q = blockBox(x, y, dir, 32, l2);
          return { dir, q, score: (inPlot(q) ? 0 : 1e4) + hitsLines(pad(q, 2)) * 100 + hitsBoxes(q) * 100 + i };
        })
        .sort((p, q) => p.score - q.score)[0];
      after.push({ t: "block", g: blockGeometry({ x, y, dir: best.dir, len: 32, l1, l2, sim: pick.sim }) });
      boxes.push(best.q);
      after.push(bracket(x, y));
    } else if (railPick) {
      // a rail tick (no string): bracket it on the rail; the block carries its place MP and clock, and a
      // select caret on the MP ruler shows where that is along the track. The block stays in the rail column,
      // at least 8 px left of the time-ruler labels (P5): ne first, then nw, else a flagpole.
      const { x, y } = railPick;
      const l2r = `${pickPoint ? mp : pick.aar} · ${pick.clock}`;
      const rightLimit = px0 - 12 - 5 * CHAR - 8;
      const w = Math.max(l1.length + (pick.sim ? 4 : 0), l2r.length) * CHAR;
      const k20 = 20 / Math.SQRT2;
      if (x + 10 + k20 + 4 + w <= rightLimit) after.push({ t: "block", g: blockGeometry({ x: x + 10, y: y - 6, dir: "ne", len: 20, l1, l2: l2r, sim: pick.sim }) });
      else if (x - 10 - k20 - 4 - w >= 0) after.push({ t: "block", g: blockGeometry({ x: x - 10, y: y - 6, dir: "nw", len: 20, l1, l2: l2r, sim: pick.sim }) });
      else {
        const up = y - 70 >= py0 - 40;
        const bx = Math.round(Math.max(0, Math.min(x - w / 2, rightLimit - w)));
        const yEnd = up ? y - 36 : y + 30;
        const b1 = up ? y - 56 : y + 44;
        after.push(line(snap(x), up ? y - 11 : y + 11, snap(x), yEnd, "s-hair k-line"));
        after.push({ t: "rect", x: bx - 2, y: b1 - 12, w: Math.round(w) + 4, h: 32, cls: "f-void" });
        after.push({ t: "text", x: bx, y: b1, s: l1, cls: "tx-data", sim: pick.sim });
        after.push(text(bx, b1 + 15, l2r, "tx-num2"));
      }
      after.push(bracket(x, y));
      if (pickPoint && pickPoint.route_mi >= v0 && pickPoint.route_mi <= v1) {
        const cx = Math.round(X(pickPoint.route_mi));
        after.push({ t: "path", d: `M${cx - 5} ${ry + 9}H${cx + 5}L${cx} ${ry + 2}Z`, cls: "hi-caret" });
      }
    } else if (pick.kind !== "rail") {
      const o = off.find((q) => q.row.id === pick.id);
      if (o) {
        const x = o.side === "l" ? px0 + 6 : px1 - 6;
        const dir: Direction = o.side === "l" ? "ne" : "nw";
        const l2off = `${l2} · OFF VIEW`;
        after.push({ t: "block", g: blockGeometry({ x, y: Math.round(o.y), dir, len: 24, l1, l2: l2off, sim: pick.sim }) });
        boxes.push(blockBox(x, Math.round(o.y), dir, 24, l2off));
      }
    }
  }

  // string labels: walk each string from where it enters the view and take the first spot, on either side,
  // that no line crosses (P5). Knocked out of the plot by a 2 px void stroke.
  for (const l of labels) {
    const id = fmt.trainId(l.id);
    const w = id.length * CHAR;
    const prefer = l.dir === "SB" ? ["la", "lb", "ra", "rb"] : ["ra", "rb", "la", "lb"];
    let best = null as { score: number; lx: number; ly: number; q: Box; anchor: "start" | "end" } | null;
    l.anchors.forEach(([ax, ay], ai) => {
      if (best && best.score < 1) return;
      prefer.forEach((spot, pi) => {
        const right = spot[0] === "r";
        const above = spot[1] === "a";
        // next to the string first; one or two text rows further off only if that is crowded
        for (const far of [0, 1, 2]) {
          const lx = Math.round(right ? ax + 6 : ax - 6);
          const ly = Math.round(above ? ay - 5 - 13 * far : ay + 13 + 13 * far);
          const q: Box = { x0: right ? lx : lx - w, x1: right ? lx + w : lx, y0: ly - 9, y1: ly + 2 };
          const score = (inPlot(q) ? 0 : 1e4) + hitsBoxes(pad(q, 2)) * 1000 + hitsLines(pad(q, 1)) * 100 + far * 5 + ai * 0.01 + pi * 0.001;
          if (!best || score < best.score) best = { score, lx, ly, q, anchor: right ? "start" : "end" };
        }
      });
    });
    const spot = best;
    if (!spot) continue;
    boxes.push(spot.q);
    // where no clean spot exists (strings converging at a plot edge), a void plate under the label
    if (spot.score >= 100 && spot.score < 1000) {
      after.push({ t: "rect", x: spot.q.x0 - 2, y: spot.q.y0 - 1, w: spot.q.x1 - spot.q.x0 + 4, h: spot.q.y1 - spot.q.y0 + 2, cls: "hi-plate" });
    }
    after.push(text(spot.lx, spot.ly, id, "hi-train" + (l.sel ? " is-sel" : ""), spot.anchor));
  }

  // now-line (state-idle, never red); none when the range is earlier
  if (nowY != null) {
    const y = snap(nowY);
    after.push(line(px0, y, px1, y, "s-hair k-idle"));
    after.push(text(px0 - 12, Math.round(y) + 4, "NOW", "hi-now", "end"));
    after.push(line(px0 - 8, y, px0, y, "s-hair k-idle"));
  }

  const selectedString = strings.find((tr) => tr.train_id === selectedTrain);
  const notch = (t: number): { x: number; y: number } | null => {
    if (railPick) return railPick;
    const mi = selectedString ? trainMi(selectedString, t) : null;
    return mi != null && mi >= v0 && mi <= v1 ? { x: X(mi), y: Y(t) } : null;
  };

  return { px0, px1, py0, py1, y: Y, notch, hits, before, plot, after };
}

const hitTitle = (r: HistoryRow): string => `${r.clock} · ${r.aar} · ${fmt.trainId(r.train_id || r.speaker)}`;
