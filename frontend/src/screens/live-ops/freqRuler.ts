/**
 * M2 frequency ruler layout (spec 5.17), ported from HUD.svg.freqRuler.
 * Every channel gets a 4 px line-faint tick; every 10th an 8 px line tick and a MHz numeral;
 * a channel the displayed feed hears an 8 px line-faint tick; one that is also in the active bank
 * a 12 px line tick and its channel number. Channel numerals win over MHz numerals.
 */

import { BAND, chToMhz } from "$lib/hud/band";

export interface RulerInput {
  width: number;
  height: number;
  /** channel numbers heard by the displayed feed */
  hears: readonly number[];
  /** channel numbers in the active bank */
  bank: readonly number[];
  /** more channel numerals (off-bank keyed channels), ruler-local x */
  extra?: readonly { channel: number; text: string }[];
  majorLabels?: boolean;
}

export interface RulerTick {
  x: number;
  length: number;
  tone: "line" | "faint";
}

export interface RulerLabel {
  x: number;
  y: number;
  text: string;
  tone: "channel" | "extra" | "mhz";
}

export interface RulerLayout {
  ticks: RulerTick[];
  labels: RulerLabel[];
}

const CLEAR_PX = 4;
const MONO_ADVANCE = 0.6; // JetBrains Mono advance per em
const FONT_PX = 11;
const NUDGE_PX = 8;

interface TextBox {
  l: number;
  r: number;
  t: number;
  b: number;
}

const textBox = (cx: number, base: number, chars: number): TextBox => {
  const w = chars * FONT_PX * MONO_ADVANCE;
  return { l: cx - w / 2, r: cx + w / 2, t: base - FONT_PX * 0.8, b: base + FONT_PX * 0.2 };
};

export const boxesNear = (a: TextBox, b: TextBox, gap: number): boolean =>
  a.l < b.r + gap && b.l < a.r + gap && a.t < b.b + gap && b.t < a.b + gap;

const half = (v: number): number => Math.round(v) + 0.5;

/** Ruler-local x of a channel on a ruler `width` px wide. */
export const channelX = (channel: number, width: number): number =>
  Math.round(((channel - BAND.first) / (BAND.last - BAND.first)) * (width - 1));

export function rulerLayout({ width, height, hears, bank, extra = [], majorLabels = true }: RulerInput): RulerLayout {
  const heard = new Set(hears);
  const inBank = new Set(bank);
  const channelBase = 23;
  const mhzBase = height - 3;
  const ticks: RulerTick[] = [];
  const labels: RulerLabel[] = [];
  const boxes: TextBox[] = [];

  for (let ch = BAND.first; ch <= BAND.last; ch++) {
    const x = half(channelX(ch, width));
    const major = ch % 10 === 0;
    const banked = inBank.has(ch) && heard.has(ch);
    let length = 4;
    let tone: RulerTick["tone"] = "faint";
    if (banked) [length, tone] = [12, "line"];
    else if (major) [length, tone] = [8, "line"];
    else if (heard.has(ch)) length = 8;
    ticks.push({ x, length, tone });
    if (banked) {
      labels.push({ x, y: channelBase, text: String(ch).padStart(2, "0"), tone: "channel" });
      boxes.push(textBox(x, channelBase, 2));
    }
  }

  // off-bank numerals: if one lands within the clear distance of a bank numeral it moves 8 px sideways
  for (const { channel, text } of extra) {
    let x = channelX(channel, width);
    const box = (cx: number) => textBox(cx, channelBase, text.length);
    if (boxes.some((b) => boxesNear(box(x), b, CLEAR_PX))) {
      x += boxes.some((b) => boxesNear(box(x + NUDGE_PX), b, CLEAR_PX)) ? -NUDGE_PX : NUDGE_PX;
    }
    labels.push({ x, y: channelBase, text, tone: "extra" });
    boxes.push(box(x));
  }

  if (majorLabels) {
    for (let ch = BAND.first; ch <= BAND.last; ch++) {
      if (ch % 10 !== 0) continue;
      const x = half(channelX(ch, width));
      const text = chToMhz(ch).toFixed(3);
      if (boxes.some((b) => boxesNear(textBox(x, mhzBase, text.length), b, CLEAR_PX))) continue;
      labels.push({ x, y: mhzBase, text, tone: "mhz" });
    }
  }
  return { ticks, labels };
}
