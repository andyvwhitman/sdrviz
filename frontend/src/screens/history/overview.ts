/** Route overview beside the tabs: the whole route with the stringline's viewport bracketed (M1 handles). */

import { equationIndex, mpAt, mpAtPrefix, shortName, viewport } from "./geometry";
import { line, snap, text, type Prim } from "./prims";
import type { HistoryRow, Route } from "./types";

const HEIGHT = 32;
const BASELINE = 22;
/** 11 px label face with 0.1 em tracking measures about 7.7 px a character */
const LABEL_CHAR = 7.7;

export function buildOverview(route: Route, rows: HistoryRow[], width: number, small: boolean): Prim[] {
  const first = route.points[0];
  const last = route.points[route.points.length - 1];
  // endpoint labels sit outside the scale, in full at every size: the bar gives way to the names
  const room = (p: typeof first) => Math.ceil(shortName(p).length * LABEL_CHAR) + 20;
  const left = small ? room(first) : Math.max(112, room(first));
  const right = width - (small ? room(last) : Math.max(112, room(last)));
  const x = (mi: number) => left + (mi / route.length_mi) * (right - left);
  const [v0, v1] = viewport(route);

  const prims: Prim[] = [line(left, snap(BASELINE), right, snap(BASELINE), "s-hair k-faint")];
  for (const p of route.points.filter((q) => q.kind === "station")) {
    prims.push(line(snap(x(p.route_mi)), BASELINE - 3, snap(x(p.route_mi)), BASELINE, "s-hair k-faint"));
  }
  // where this route's transmissions sat in the range: 1 px marks above the baseline
  for (const r of rows.filter((q) => q.mi != null && q.kind !== "rail")) {
    prims.push(line(snap(x(r.mi!)), BASELINE - 9, snap(x(r.mi!)), BASELINE - 4, "s-hair k-line"));
  }
  // change of count (MP equation)
  const eq = equationIndex(route);
  if (eq > 0) prims.push(line(snap(x(route.points[eq].route_mi)), BASELINE - 12, snap(x(route.points[eq].route_mi)), BASELINE + 4, "s-hair k-line"));

  // viewport bracket (M1 handles)
  const a = Math.round(x(v0));
  const b = Math.round(x(v1));
  prims.push({
    t: "path",
    d: `M${a + 6} 4H${a}V${HEIGHT - 2}H${a + 6}M${b - 6} 4H${b}V${HEIGHT - 2}H${b - 6}`,
    cls: "s-emph k-ink",
  });
  prims.push(text(left - 10, BASELINE + 4, shortName(first), "hi-stn is-dim", "end"));
  prims.push(text(right + 10, BASELINE + 4, shortName(last), "hi-stn is-dim", "start"));
  const prefix = mpAt(route, (v0 + v1) / 2)?.prefix;
  const at = (mi: number) => (prefix ? `${prefix} ${(mpAtPrefix(route, prefix, mi) ?? 0).toFixed(1)}` : `≈ ${mi.toFixed(1)}`);
  prims.push(text(a + 10, 13, `VIEW ${at(v0)} – ${at(v1)}${small ? "" : ` · ${(v1 - v0).toFixed(1)} MI`}`, "tx-num"));
  return prims;
}
