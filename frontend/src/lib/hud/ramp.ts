/** Waterfall / heatmap / LOFAR ramp (spec 1.5), for canvas drawing. Values mirror --ramp-0..5 in tokens.css. */

export const RAMP = ["#04070A", "#0A1F28", "#124A5A", "#2C8FA8", "#7FD8EC", "#E8FBFF"] as const;

const hexToRgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const RAMP_RGB = RAMP.map(hexToRgb);

/** t in 0..1 -> "rgb(r g b)" */
export function rampColor(t: number): string {
  const x = Math.min(1, Math.max(0, t)) * (RAMP_RGB.length - 1);
  const i = Math.min(RAMP_RGB.length - 2, Math.floor(x));
  const f = x - i;
  const a = RAMP_RGB[i];
  const b = RAMP_RGB[i + 1];
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(" ")})`;
}

/** 60-minute LOFAR strip mapping (Live Ops, Feeds, System share it): dBFS -> 0..1. -52 is void, -10 is white. */
export const lofarT = (dbfs: number): number => Math.min(1, Math.max(0, (dbfs + 52) / 42));
