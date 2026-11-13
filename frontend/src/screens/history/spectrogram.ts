/**
 * Clip spectrogram. The backend serves audio and waveform peaks only, so the spectrogram is synthesized: the
 * formant shapes come from the transcript's word onsets (seeded by the row id, so every render is identical)
 * and the energy is gated by the real peak envelope, so a gap in the waveform is dark here too.
 * Until the peaks arrive the word onsets alone gate it. Replace with the backend endpoint when it lands.
 */

import { rampColor } from "$lib/hud/ramp";
import type { TxRow } from "$lib/types/live";

/** xorshift seeded from a string; returns values in [0, 1). */
export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

interface Burst {
  t0: number;
  t1: number;
}

/** One burst of speech energy per word. */
export function speechBursts(row: Pick<TxRow, "words" | "duration_s">): Burst[] {
  const duration = row.duration_s || 1;
  const words = row.words ?? [];
  return words.map((word, i) => {
    const t = word.t ?? 0;
    const next = i + 1 < words.length ? (words[i + 1].t ?? t) : duration - 0.15;
    const length = Math.max(0.12, Math.min(next - t - 0.04, 0.09 * word.w.length + 0.08));
    return { t0: t, t1: t + length };
  });
}

/** Peak envelope resampled to `columns` (max per column) and scaled so the loudest is 1. */
export function columnEnvelope(peaks: number[], columns: number): number[] {
  if (!peaks.length || columns <= 0) return [];
  const loudest = Math.max(...peaks, 1e-6);
  return Array.from({ length: columns }, (_, c) => {
    const from = Math.floor((c / columns) * peaks.length);
    const to = Math.max(from + 1, Math.ceil(((c + 1) / columns) * peaks.length));
    return Math.max(...peaks.slice(from, to)) / loudest;
  });
}

/** 0 for silence (below the noise), 1 for speech, smooth in between. */
export const gate = (level: number): number => {
  const x = Math.min(1, Math.max(0, (level - 0.1) / 0.3));
  return x * x * (3 - 2 * x);
};

export function drawSpectrogram(canvas: HTMLCanvasElement, row: TxRow, width: number, height: number, peaks: number[] = []): void {
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d");
  if (!g) return;
  const random = seeded(`${row.id}:spec`);
  const duration = row.duration_s || 1;
  const bursts = speechBursts(row);
  const bins = 32; // 32 rows of 125 Hz over 0 to 4 kHz
  const columnWidth = 2;
  const columns = Math.floor(width / columnWidth);
  const rowHeight = height / bins;
  const envelope = columnEnvelope(peaks, columns);
  for (let c = 0; c < columns; c++) {
    const t = (c / columns) * duration;
    const inBurst = bursts.find((b) => t >= b.t0 && t <= b.t1);
    // the real envelope decides where there is speech; the word timing only shapes the formants
    const speech = envelope.length ? gate(envelope[c]) : inBurst ? 1 : 0;
    const burst = speech > 0 ? (inBurst ?? { t0: Math.floor(t * 4) / 4, t1: Math.floor(t * 4) / 4 + 0.25 }) : undefined;
    const u = burst ? (t - burst.t0) / (burst.t1 - burst.t0) : 0;
    const f1 = 450 + 350 * Math.sin(u * 2.4 + (burst ? burst.t0 : 0));
    const f2 = 1300 + 700 * Math.sin(u * 1.7 + (burst ? burst.t0 * 3 : 0));
    for (let k = 0; k < bins; k++) {
      const f = (k + 0.5) * 125;
      let e = 0.06 + random() * 0.08; // floor, clamped just under the noise (brief 3.3)
      if (burst) {
        const env = speech * (0.55 + 0.45 * Math.sin(Math.PI * u));
        e += env * (0.75 * Math.exp(-(((f - f1) / 260) ** 2)) + 0.5 * Math.exp(-(((f - f2) / 380) ** 2)) + 0.22 * Math.exp(-(((f - 2700) / 500) ** 2)));
        e += env * 0.12 * random();
      }
      if (row.state === "carrier_only") e = 0.05 + random() * 0.06;
      g.fillStyle = rampColor(Math.min(1, e));
      g.fillRect(c * columnWidth, height - (k + 1) * rowHeight, columnWidth, Math.ceil(rowHeight));
    }
  }
}
