/** Display formatters (spec 2.4). Ported from HUD.fmt in design/mockups/_shared/hud.js. */

import { clockText, parseClock, wrapDay } from "$lib/time";

export const MINUS = "−";
/** Unknown value; never print zero for unknown. */
export const BLANK = "— — —";

const pad = (n: number, width = 2): string => String(Math.trunc(n)).padStart(width, "0");

type Maybe<T> = T | null | undefined;

export interface MilepostParts {
  prefix: string;
  num: string;
  derived: boolean;
}

/** 160.92 -> "160.920" */
export const freq = (mhz: Maybe<number>): string => (mhz == null ? BLANK : Number(mhz).toFixed(3));

/** 54 -> "5454", 8 -> "0808" (AAR TX/RX pair) */
export const aar = (ch: Maybe<number>): string => (ch == null ? BLANK : pad(ch) + pad(ch));

/** 54 -> "CH54" */
export const ch = (n: Maybe<number>): string => (n == null ? BLANK : `CH${pad(n)}`);

/** Signed number with a true minus sign. */
export function num(v: Maybe<number>, digits = 1): string {
  if (v == null || Number.isNaN(v)) return BLANK;
  return (v < 0 ? MINUS : "") + Math.abs(v).toFixed(digits);
}

export const dbfs = (v: Maybe<number>): string => (v == null ? BLANK : `${num(v, 1)} dBFS`);
export const snr = (v: Maybe<number>): string => (v == null ? BLANK : `SNR ${Math.round(v)} dB`);

/**
 * "BAA33.7" (native) | "4.2" (derived, no count) | "≈CFP 85.6" (derived, keeps its count).
 * With two arguments, ("NEC", 113.6), it is always native.
 */
export function mpParts(a: Maybe<string | number>, b?: Maybe<number>): MilepostParts | null {
  if (a == null) return null;
  if (b != null) return { prefix: String(a).toUpperCase(), num: Number(b).toFixed(1), derived: false };
  const m = String(a).trim().match(/^(≈)?\s*([A-Za-z]+)?\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return { prefix: m[2] ? m[2].toUpperCase() : "", num: Number(m[3]).toFixed(1), derived: !!m[1] || !m[2] };
}

/** "BAA33.7" | "NEC 113.6" | ("NEC", 113.6) -> "NEC 113.6"; no prefix -> "≈ 4.2" */
export function mp(a: Maybe<string | number>, b?: Maybe<number>): string {
  const p = mpParts(a, b);
  if (!p) return BLANK;
  if (!p.derived) return `${p.prefix} ${p.num}`;
  return `≈${p.prefix ? p.prefix + " " : " "}${p.num}`;
}

/**
 * Seconds-of-day | "14:07:30" -> "14:07:30 EST". Zone "UTC" shifts by `utcShiftS`
 * (the zone's offset from UTC, 5 h for EST); any other zone prints local time.
 */
export function clock(t: Maybe<number | string>, zone = "EST", utcShiftS = 5 * 3600): string {
  const s = typeof t === "string" ? parseClock(t) : t;
  if (s == null || Number.isNaN(s)) return BLANK;
  const shown = zone === "UTC" ? wrapDay(s + utcShiftS) : s;
  return `${clockText(shown)} ${zone}`.trimEnd();
}

/** Clock without seconds: "07:00" */
export const hm = (t: number | string): string => clock(t, "").slice(0, 5);

/** Duration under 1 h: 7.4 -> "00:07.4" */
export function dur(s: Maybe<number>): string {
  if (s == null) return BLANK;
  const tenths = Math.floor(s * 10 + 1e-6);
  return `${pad(tenths / 600)}:${pad((tenths % 600) / 10)}.${tenths % 10}`;
}

/** Totals: 6760 -> "01:52:40" */
export function total(s: Maybe<number>): string {
  if (s == null) return BLANK;
  const n = Math.round(s);
  return `${pad(n / 3600)}:${pad((n % 3600) / 60)}:${pad(n % 60)}`;
}

/**
 * Ages: 48 -> "48S"; 240 -> "4M"; 4320 -> "1H 12M"; 183600 -> "2D 3H".
 * Form "age" adds seconds under 10 min: 72 -> "1M 12S".
 */
export function age(seconds: Maybe<number>, form: "last" | "age" = "last"): string {
  if (seconds == null) return BLANK;
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}S`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    return form === "age" && s < 600 ? `${m}M ${s % 60}S` : `${m}M`;
  }
  if (s < 86400) return `${Math.floor(s / 3600)}H ${Math.floor((s % 3600) / 60)}M`;
  return `${Math.floor(s / 86400)}D ${Math.floor((s % 86400) / 3600)}H`;
}

export const pct = (v: Maybe<number>): string => (v == null ? BLANK : `${Math.round(v)}%`);

/** Train and speaker ids are uppercase everywhere: "Amtrak 53" -> "AMTRAK 53". */
export const trainId = (id: Maybe<string>): string => (id == null ? "" : id.trim().replace(/\s+/g, " ").toUpperCase());

/** "CH54" -> 54 (channel number from a scenario `aar` string). */
export const channelNumber = (aarText: string): number => Number(aarText.replace(/\D/g, ""));
