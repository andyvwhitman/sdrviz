/** An allowed range for a size in px, and the clamp into it. Shared by the draggable dividers. */

export interface Bounds {
  min: number;
  max: number;
}

export const clamp = (value: number, { min, max }: Bounds): number => Math.max(min, Math.min(max, value));
