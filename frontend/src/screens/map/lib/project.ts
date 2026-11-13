/**
 * Map projection: Lambert conformal conic (d3-geo, parallels 38.3 / 39.45, central meridian -77), turned by a
 * planar angle so the Union Station to Baltimore Penn chord is level, then fitted to the canvas.
 * A view (zoom k, translation) sits on top of the fitted base and never changes the base.
 */

import { geoConicConformalRaw } from "d3-geo";
import type { Pt } from "./geom";

export const RAD = Math.PI / 180;
export const EARTH_KM = 6371.0088;
export const MI_KM = 1.609344;
/** 20 mi as an arc of 0.2895 degrees */
export const R20_KM = 0.2895 * RAD * EARTH_KM;

export type LonLat = [number, number];

export interface View {
  k: number;
  tx: number;
  ty: number;
}

export const DEFAULT_VIEW: View = { k: 1, tx: 0, ty: 0 };

/** The point `km` away from (lon, lat) on `bearing` degrees. */
export function destination([lon, lat]: LonLat, bearing: number, km: number): LonLat {
  const d = km / EARTH_KM;
  const b = bearing * RAD;
  const p = lat * RAD;
  const p2 = Math.asin(Math.sin(p) * Math.cos(d) + Math.cos(p) * Math.sin(d) * Math.cos(b));
  const l2 = lon * RAD + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p), Math.cos(d) - Math.sin(p) * Math.sin(p2));
  return [l2 / RAD, p2 / RAD];
}

/** Great-circle distance in km. */
export function distanceKm(a: LonLat, b: LonLat): number {
  const [p1, p2] = [a[1] * RAD, b[1] * RAD];
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(((b[0] - a[0]) * RAD) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

export function circle(centre: LonLat, km: number, step = 4): LonLat[] {
  const out: LonLat[] = [];
  for (let bearing = 0; bearing < 360; bearing += step) out.push(destination(centre, bearing, km));
  return out;
}

const CENTRAL_MERIDIAN = -77;
const conic = geoConicConformalRaw(38.3 * RAD, 39.45 * RAD);

/** Conic coordinates with y down. */
function conicXY([lon, lat]: LonLat): Pt {
  const [x, y] = conic((lon - CENTRAL_MERIDIAN) * RAD, lat * RAD);
  return [x, -y];
}

function conicInvert([x, y]: Pt): LonLat {
  const [lambda, phi] = conic.invert!(x, -y);
  return [lambda / RAD + CENTRAL_MERIDIAN, phi / RAD];
}

export class BaseProjection {
  private angle = 0;
  private k = 1;
  private tx = 0;
  private ty = 0;

  constructor(
    readonly width: number,
    readonly height: number,
    chord: [LonLat, LonLat],
    fitTo: LonLat[],
  ) {
    this.fit(chord, fitTo);
  }

  /** Turn so `chord` is level and left-to-right, then fit `fitTo` to the canvas. */
  private fit([from, to]: [LonLat, LonLat], fitTo: LonLat[]): void {
    const [a, b] = [conicXY(from), conicXY(to)];
    this.angle = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (let turn = 0; turn < 2; turn++) {
      const pts = fitTo.map((p) => this.rotate(conicXY(p)));
      const [xs, ys] = [pts.map((p) => p[0]), pts.map((p) => p[1])];
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      this.k = Math.min(this.width / (x1 - x0), this.height / (y1 - y0));
      this.tx = this.width / 2 - (this.k * (x0 + x1)) / 2;
      this.ty = this.height / 2 - (this.k * (y0 + y1)) / 2;
      const [u, v] = [this.project(from), this.project(to)];
      if (v[0] > u[0] && Math.abs(v[1] - u[1]) <= 0.02 * this.height) return;
      this.angle += Math.PI;
    }
  }

  private rotate([x, y]: Pt): Pt {
    return [x * Math.cos(this.angle) - y * Math.sin(this.angle), x * Math.sin(this.angle) + y * Math.cos(this.angle)];
  }

  project(p: LonLat): Pt {
    const [x, y] = this.rotate(conicXY(p));
    return [x * this.k + this.tx, y * this.k + this.ty];
  }

  invert([X, Y]: Pt): LonLat {
    const [x, y] = [(X - this.tx) / this.k, (Y - this.ty) / this.k];
    const [c, s] = [Math.cos(this.angle), Math.sin(this.angle)];
    return conicInvert([x * c + y * s, -x * s + y * c]);
  }

  /** Zoom that fits `pts` to the canvas, relative to this base (below 1 means zoomed out). */
  zoomToFit(pts: LonLat[]): number {
    const projected = pts.map((p) => this.project(p));
    const [xs, ys] = [projected.map((p) => p[0]), projected.map((p) => p[1])];
    return Math.min(this.width / (Math.max(...xs) - Math.min(...xs)), this.height / (Math.max(...ys) - Math.min(...ys)));
  }
}

/** The base projection seen through a view. */
export class Projection {
  constructor(
    readonly base: BaseProjection,
    readonly view: View,
  ) {}

  project = (p: LonLat): Pt => {
    const [x, y] = this.base.project(p);
    return [x * this.view.k + this.view.tx, y * this.view.k + this.view.ty];
  };

  invert = ([X, Y]: Pt): LonLat => this.base.invert([(X - this.view.tx) / this.view.k, (Y - this.view.ty) / this.view.k]);

  /** Canvas pixels per km at the canvas centre. */
  pxPerKm(): number {
    const c = this.invert([this.base.width / 2, this.base.height / 2]);
    const [a, b] = [this.project(c), this.project(destination(c, 90, 10))];
    return Math.hypot(a[0] - b[0], a[1] - b[1]) / 10;
  }

  /** Screen direction of +lat at the canvas centre (unit vector). */
  northDirection(): Pt {
    const c = this.invert([this.base.width / 2, this.base.height / 2]);
    const [a, b] = [this.project(c), this.project([c[0], c[1] + 0.05])];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  }
}

/** The default base for a canvas: two 20 mi circles around Union Station and Baltimore Penn. */
export function defaultBase(width: number, height: number, union: LonLat, penn: LonLat): BaseProjection {
  return new BaseProjection(width, height, [union, penn], [...circle(union, R20_KM, 2), ...circle(penn, R20_KM, 2)]);
}

/** Keep the view inside sensible zoom limits. */
export const clampZoom = (k: number, min: number, max = 8): number => Math.max(min, Math.min(max, k));

/** Zoom by `factor` about a canvas point. */
export function zoomAbout(view: View, factor: number, at: Pt, min: number): View {
  const k = clampZoom(view.k * factor, min);
  const f = k / view.k;
  return { k, tx: at[0] - (at[0] - view.tx) * f, ty: at[1] - (at[1] - view.ty) * f };
}
