/** Real trains on the map: snap a GPS position onto the nearest route, by route mile. */

import type { Vehicle } from "$lib/types/transit";
import type { Route } from "./types";

/** Farther than this from every route and a train is not drawn on the schematic. */
export const MAX_SNAP_KM = 3;
const KM_PER_DEG = 111.32;

export interface RouteSnap {
  routeId: string;
  routeMi: number;
  distKm: number;
  /** +1 when the vehicle heads toward increasing route miles, -1 away, 0 when unknown */
  sign: -1 | 0 | 1;
}

/** Bearing in degrees (0 = north, clockwise) of the step from a to b, on a local flat map. */
const bearingOf = (dx: number, dy: number): number => ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;

/** Closest point of one route to a position: km east/north from the position makes the maths flat and local. */
function snapToRoute(route: Route, lat: number, lon: number): RouteSnap | null {
  const kx = KM_PER_DEG * Math.cos((lat * Math.PI) / 180);
  let best: (RouteSnap & { heading: number }) | null = null;
  const pts = route.points;
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const [ax, ay] = [(a.lon - lon) * kx, (a.lat - lat) * KM_PER_DEG];
    const [bx, by] = [(b.lon - lon) * kx, (b.lat - lat) * KM_PER_DEG];
    const [dx, dy] = [bx - ax, by - ay];
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const distKm = Math.hypot(ax + dx * t, ay + dy * t);
    if (!best || distKm < best.distKm) {
      const forward = b.route_mi >= a.route_mi;
      best = {
        routeId: route.id,
        routeMi: a.route_mi + (b.route_mi - a.route_mi) * t,
        distKm,
        sign: 0,
        heading: forward ? bearingOf(dx, dy) : bearingOf(-dx, -dy),
      };
    }
  }
  return best;
}

/** The nearest route within MAX_SNAP_KM, with the direction of travel along it when the vehicle reports a bearing. */
export function snapVehicle(routes: Route[], v: Pick<Vehicle, "lat" | "lon" | "bearing">): RouteSnap | null {
  let best: (RouteSnap & { heading: number }) | null = null;
  for (const route of routes) {
    const snap = snapToRoute(route, v.lat, v.lon) as (RouteSnap & { heading: number }) | null;
    if (snap && (!best || snap.distKm < best.distKm)) best = snap;
  }
  if (!best || best.distKm > MAX_SNAP_KM) return null;
  const { heading, ...snap } = best;
  if (v.bearing != null) {
    const turn = Math.abs(((v.bearing - heading + 540) % 360) - 180); // 0 = same way, 180 = opposite
    snap.sign = turn < 90 ? 1 : -1;
  }
  return snap;
}
