/** M2 frequency ruler geometry across the AAR band (spec 5.17), ported from HUD.svg.freqRuler. */

import { BAND, chToMhz } from "$lib/hud/band";
import { freq } from "$lib/hud/fmt";

/** Clearance between a MHz numeral and any channel numeral (spec 11.7). */
export const RULER_CLEAR_PX = 4;
/** JetBrains Mono advance width per em. */
const MONO_ADVANCE = 0.6;
const NUMERAL_PX = 11;

/** Round to the pixel centre so a 1 px stroke is crisp. */
export const snap = (value: number): number => Math.round(value) + 0.5;

const pad2 = (n: number): string => String(n).padStart(2, "0");

export interface Box {
  l: number;
  r: number;
  t: number;
  b: number;
}

const textBox = (cx: number, baseline: number, chars: number): Box => {
  const width = chars * NUMERAL_PX * MONO_ADVANCE;
  return { l: cx - width / 2, r: cx + width / 2, t: baseline - NUMERAL_PX * 0.8, b: baseline + NUMERAL_PX * 0.2 };
};

const near = (a: Box, b: Box, gap: number): boolean => a.l < b.r + gap && b.l < a.r + gap && a.t < b.b + gap && b.t < a.b + gap;

export interface RulerOptions {
  /** ruler width in px */
  w: number;
  h?: number;
  /** channels heard by the displayed feed */
  hears?: number[];
  /** channels of the active bank */
  bank?: number[];
  majorLabels?: boolean;
  /** more channel numerals (off-bank, ink-3) at ruler-local x */
  extraLabels?: { x: number; text: string }[];
}

export interface Tick {
  x: number;
  len: number;
  tone: "line" | "faint";
}

export interface Numeral {
  x: number;
  y: number;
  text: string;
  /** bank numerals are ink-2, off-bank and MHz numerals ink-3 */
  bright: boolean;
}

export interface RulerGeometry {
  ticks: Tick[];
  numerals: Numeral[];
}

/**
 * Every channel: a 4 px faint tick; every tenth: 8 px line with a MHz numeral; heard: 8 px faint;
 * in the bank and heard: 12 px line with its channel number. Channel numerals win over MHz numerals.
 */
export function rulerGeometry({ w, h = 32, hears = [], bank = [], majorLabels = true, extraLabels = [] }: RulerOptions): RulerGeometry {
  const heard = new Set(hears);
  const inBank = new Set(bank);
  const px = (ch: number): number => Math.round(((ch - BAND.first) / (BAND.last - BAND.first)) * (w - 1));
  const channelBaseline = 23;
  const mhzBaseline = h - 3;
  const ticks: Tick[] = [];
  const numerals: Numeral[] = [];
  const channelBoxes: Box[] = [];

  for (let ch = BAND.first; ch <= BAND.last; ch++) {
    const x = snap(px(ch));
    const bankHeard = inBank.has(ch) && heard.has(ch);
    if (bankHeard) ticks.push({ x, len: 12, tone: "line" });
    else if (ch % 10 === 0) ticks.push({ x, len: 8, tone: "line" });
    else if (heard.has(ch)) ticks.push({ x, len: 8, tone: "faint" });
    else ticks.push({ x, len: 4, tone: "faint" });
    if (bankHeard) {
      numerals.push({ x, y: channelBaseline, text: pad2(ch), bright: true });
      channelBoxes.push(textBox(x, channelBaseline, 2));
    }
  }
  for (const label of extraLabels) {
    numerals.push({ x: label.x, y: channelBaseline, text: label.text, bright: false });
    channelBoxes.push(textBox(label.x, channelBaseline, label.text.length));
  }
  if (majorLabels) {
    for (let ch = BAND.first; ch <= BAND.last; ch++) {
      if (ch % 10 !== 0) continue;
      const x = snap(px(ch));
      const text = freq(chToMhz(ch));
      const box = textBox(x, mhzBaseline, text.length);
      if (!channelBoxes.some((other) => near(box, other, RULER_CLEAR_PX))) numerals.push({ x, y: mhzBaseline, text, bright: false });
    }
  }
  return { ticks, numerals };
}

/**
 * Off-bank channel numerals for the ruler. The shared ruler centres its numbers; an off-bank number
 * that would touch a neighbour slides sideways just enough (never onto the next number), so CH12
 * beside CH14 reads "12 14".
 */
export function offBankLabels(bankHeard: number[], offBank: number[], xOf: (ch: number) => number): { x: number; text: string }[] {
  const slide = 8;
  const numeralW = 2 * NUMERAL_PX * MONO_ADVANCE;
  const items = bankHeard
    .map((ch) => ({ ch, x: xOf(ch), fixed: true }))
    .concat(offBank.map((ch) => ({ ch, x: xOf(ch), fixed: false })))
    .sort((a, b) => a.ch - b.ch);
  const labels: { x: number; text: string }[] = [];
  items.forEach((item, i) => {
    if (item.fixed) return;
    const prev = items[i - 1];
    const next = items[i + 1];
    const home = xOf(item.ch);
    if (next && next.x - item.x < numeralW + RULER_CLEAR_PX) item.x = Math.max(home - slide, next.x - numeralW - RULER_CLEAR_PX);
    if (prev && item.x - prev.x < numeralW + RULER_CLEAR_PX) item.x = Math.min(home + slide, prev.x + numeralW + RULER_CLEAR_PX);
    labels.push({ x: item.x, text: pad2(item.ch) });
  });
  return labels;
}
