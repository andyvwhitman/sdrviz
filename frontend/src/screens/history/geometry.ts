/** Route geometry for the stringline. Ported from design/mockups/history.js (viewport, MP maths, nearest route). */

import { wrapDay } from "$lib/time";
import * as fmt from "$lib/hud/fmt";
import type { PlaceCoords, Route, Train } from "./types";

/** Clock text without seconds, wrapped onto the day ("-1800" -> "23:30"). */
export const hm = (t: number): string => fmt.hm(wrapDay(t));

/** The mockup's range syntax: "13:00-14:00" -> [seconds, seconds], else null. */
export function parseRange(text: string | null): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(text ?? "");
  if (!m) return null;
  const a = Number(m[1]) * 3600 + Number(m[2]) * 60;
  const b = Number(m[3]) * 3600 + Number(m[4]) * 60;
  return b > a && b <= 86400 ? [a, b] : null;
}

/** The route a place that is on no route belongs to: the nearest route point (brief 9.0.4, margin rail). */
export function nearestRoute(routes: Route[], [lat, lon]: [number, number]): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  const lonScale = Math.cos((lat * Math.PI) / 180);
  for (const route of routes) {
    for (const p of route.points) {
      if (p.lat == null || p.lon == null) continue;
      const d = (p.lat - lat) ** 2 + ((p.lon - lon) * lonScale) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = route.id;
      }
    }
  }
  return best;
}

/** Route id of every place on a route (first route wins), as the mockup's routeOfPlace. */
export function routeOfPlaces(routes: Route[]): Record<string, string> {
  const owner: Record<string, string> = {};
  for (const route of routes) for (const p of route.points) owner[p.place_id] ??= route.id;
  return owner;
}

export function rowRoute(routes: Route[], owner: Record<string, string>, places: PlaceCoords, placeId: string | null): string | null {
  if (!placeId) return null;
  if (owner[placeId]) return owner[placeId];
  return places[placeId] ? nearestRoute(routes, places[placeId]) : null;
}

/** A train's position (route miles) at time t, linear between stops (brief 9.0.5); null outside its run. */
export function trainMi(train: Train, t: number): number | null {
  const stops = train.stops;
  if (!stops.length || t < stops[0].t || t > stops[stops.length - 1].t) return null;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].t) {
      const a = stops[i - 1];
      const b = stops[i];
      const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return a.route_mi + (b.route_mi - a.route_mi) * f;
    }
  }
  return null;
}

/** The same run shifted by whole days, so it lands in the window (a window of yesterday uses -86400). */
export function shiftTrain(train: Train, shift: number): Train {
  if (!shift) return train;
  return {
    ...train,
    start_t: train.start_t + shift,
    end_t: train.end_t + shift,
    stops: train.stops.map((s) => ({ ...s, t: s.t + shift })),
  };
}

const pointsWithMp = (route: Route) => route.points.filter((p) => p.mp != null);

/** Native MP at route miles: piecewise linear over the route's MP points, by count prefix. */
export function mpAt(route: Route, mi: number): { prefix: string; mp: number } | null {
  const pts = pointsWithMp(route);
  if (!pts.length) return null;
  let a = pts[0];
  let b = pts[pts.length - 1];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].route_mi >= mi) {
      a = pts[i - 1];
      b = pts[i];
      break;
    }
  }
  // across a change of count, use the segment on the side mi lies on
  if (a.prefix !== b.prefix) {
    if (mi - a.route_mi < b.route_mi - mi) b = a;
    else a = b;
  }
  if (a === b) {
    const same = pts.filter((p) => p.prefix === a.prefix);
    const i = same.indexOf(a);
    const other = same[i + 1] ?? same[i - 1];
    if (!other) return { prefix: a.prefix ?? "", mp: a.mp! };
    const slope = (other.mp! - a.mp!) / (other.route_mi - a.route_mi);
    return { prefix: a.prefix ?? "", mp: a.mp! + slope * (mi - a.route_mi) };
  }
  const f = (mi - a.route_mi) / (b.route_mi - a.route_mi);
  return { prefix: a.prefix ?? "", mp: a.mp! + (b.mp! - a.mp!) * f };
}

/** MP of one count (prefix) at route miles, linear over that count's points (extrapolates at the ends). */
export function mpAtPrefix(route: Route, prefix: string, mi: number): number | null {
  const pts = pointsWithMp(route).filter((p) => p.prefix === prefix);
  if (pts.length < 2) return pts.length ? pts[0].mp : null;
  let a = pts[0];
  let b = pts[1];
  for (let i = 1; i < pts.length; i++) {
    a = pts[i - 1];
    b = pts[i];
    if (b.route_mi >= mi) break;
  }
  return a.mp! + ((b.mp! - a.mp!) * (mi - a.route_mi)) / (b.route_mi - a.route_mi);
}

/** Inverse: route miles for a native MP of one count (for ruler ticks). */
export function miAtPrefix(route: Route, prefix: string, mp: number): number | null {
  const pts = pointsWithMp(route).filter((p) => p.prefix === prefix);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if ((mp - a.mp!) * (mp - b.mp!) <= 0 && a.mp !== b.mp) {
      return a.route_mi + ((mp - a.mp!) / (b.mp! - a.mp!)) * (b.route_mi - a.route_mi);
    }
  }
  return null;
}

/** "NEC 113.6" for a position on the route, or the bare mile when the route has no MPs. */
export function mpLabel(route: Route, mi: number): string {
  const m = mpAt(route, mi);
  return m ? `${m.prefix} ${m.mp.toFixed(1)}` : mi.toFixed(1);
}

/** Index of the point where the milepost count changes (the MP equation), or -1. */
export function equationIndex(route: Route): number {
  return route.points.findIndex((p, i) => i > 0 && !!p.prefix && !!route.points[i - 1].prefix && p.prefix !== route.points[i - 1].prefix);
}

/** The stretch of the route the stringline shows: the NEC between Washington and Baltimore, else the whole route. */
export function viewport(route: Route): [number, number] {
  if (route.id === "r-nec") {
    const a = route.points.find((p) => p.place_id === "wash-union" && p.prefix === "NEC");
    const b = route.points.find((p) => p.place_id === "baltimore-penn");
    if (a && b) return [a.route_mi, b.route_mi];
  }
  return [0, route.length_mi];
}

const SHORT_NAMES: Record<string, string> = {
  "wash-union": "WASHINGTON",
  "landover-int": "LANDOVER",
  "new-carrollton": "NEW CARROLLTON",
  "bowie-state": "BOWIE STATE",
  "west-baltimore": "W BALTIMORE",
  "baltimore-penn": "BALTIMORE PENN",
  "b-p-tunnel": "B&P TUNNEL",
};

/** Station label: seed names carry operators and long forms ("Camden Station (Camden Yards)" -> CAMDEN). */
export function shortName(point: { place_id: string; name: string }): string {
  return (
    SHORT_NAMES[point.place_id] ??
    point.name
      .replace(/\s*\(.*?\)/g, "")
      .replace(/-University.*$/i, "")
      .replace(/ (Station|Interlocking)$/i, "")
      .replace(/ Yard$/i, " YD")
      .replace(/ defect detector$/i, " DET")
      .toUpperCase()
  );
}
