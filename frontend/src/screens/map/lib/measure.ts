/** Text measurement for the placers: injected, so tests run without a canvas. */

export type Font = "mono12" | "mono11" | "lab11" | "line11" | "term13";

export interface Measure {
  /** width of the string as typeset, no case change (mono faces) */
  exact(text: string, font: Font): number;
  /** width of the uppercase string with the face's letter-spacing (label faces) */
  tracked(text: string, font: Font): number;
}

/** Font shorthand and letter-spacing in em, as in map.css. */
export const FONTS: Record<Font, { css: string; tracking: number; px: number }> = {
  mono12: { css: '400 15px "JetBrains Mono"', tracking: 0, px: 15 },
  mono11: { css: '400 14px "JetBrains Mono"', tracking: 0, px: 14 },
  lab11: { css: '500 14px "Barlow Semi Condensed"', tracking: 0.1, px: 14 },
  line11: { css: '500 14px "Barlow Semi Condensed"', tracking: 0.16, px: 14 },
  term13: { css: '600 16px "Rajdhani"', tracking: 0.12, px: 16 },
};

/** Measure with a canvas 2D context (fonts must be loaded). */
export function canvasMeasure(ctx: Pick<CanvasRenderingContext2D, "font" | "measureText">): Measure {
  const exact = (text: string, font: Font): number => {
    ctx.font = FONTS[font].css;
    return ctx.measureText(text).width;
  };
  return {
    exact,
    tracked: (text, font) => exact(text.toUpperCase(), font) + text.length * FONTS[font].tracking * FONTS[font].px,
  };
}

/** Fixed-advance estimate: mono 0.6 em, label faces 0.5 em. Good enough for the tests. */
export const estimateMeasure: Measure = {
  exact: (text, font) => text.length * FONTS[font].px * 0.6,
  tracked: (text, font) => text.length * FONTS[font].px * (0.5 + FONTS[font].tracking),
};
