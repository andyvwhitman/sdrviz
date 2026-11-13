import type { Pt } from "./geom";
import { round1 } from "./geom";

/** SVG path data for a polyline, 0.1 px resolution. */
export const dPath = (pts: Pt[], close = false): string =>
  pts.length ? `M${pts.map((p) => `${round1(p[0])} ${round1(p[1])}`).join("L")}${close ? "Z" : ""}` : "";
