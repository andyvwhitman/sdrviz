/**
 * A fake recordings API for dev and screenshots, for a backend that has nothing recorded yet. A Vite dev
 * middleware answering /api/recordings* and /api/frequencies/**activity in the shapes of docs/recordings-api.md.
 * Start the dev server with
 *
 *     VITE_FAKE_RECORDINGS=1 npm run dev
 *
 * Three frequencies have a week of made-up traffic (amtk-k-tower, amtk-nec-road, amtk-wash-term), with every
 * transcript state and expired audio on the oldest rows; every other frequency has nothing recorded. The audio is
 * a short tone served as WAV, with range requests. The newest row is always about two minutes old and `pending`.
 *
 * Delete this file with the vite.config.ts hook once the backend has real recordings.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { zoneParts } from "../src/screens/frequency/frequency.ts";
import type { ActivityBucket, Recording } from "../src/lib/types/recordings.ts";

const TZ = "America/New_York";
const MIN = 60_000;
const DAY = 86_400_000;
const FEEDS = ["feed-lnd", "feed-bwi", "feed-alx"];
const TEXTS = [
  "K Tower to Amtrak 171, track 12, take it to the bumper.",
  "Washington Terminal, 2153 ready on 8.",
  "Amtrak 2 3 1, clear signal on track two, over.",
  "Dispatcher, Amtrak 83 is holding short of the interlocking, request permission to proceed.",
  "Roger, 83, you are lined up for track 4, proceed on signal.",
  "Yard job 27 is going to be pulling out of Ivy City in about ten minutes.",
  "Copy that. Conductor says all aboard on 12.",
];
/** busier at the morning and afternoon peaks */
const HOURLY = [0, 0, 0, 0.1, 0.3, 0.8, 1.5, 2.2, 1.6, 1, 0.8, 0.9, 1, 0.9, 1, 1.4, 2, 1.8, 1.2, 0.8, 0.5, 0.3, 0.2, 0.1];
const BUSY = new Map([["amtk-k-tower", 2], ["amtk-nec-road", 4], ["amtk-wash-term", 1]]);

let seed = 7;
const random = (): number => {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
  return seed / 2_147_483_648;
};

const NOW = Date.now();
const iso = (ms: number): string => new Date(ms).toISOString();

function makeRows(frequencyId: string, scale: number): Recording[] {
  const rows: Recording[] = [];
  const first = NOW - 6.4 * DAY;
  for (let hour = Math.floor(first / 3_600_000); hour * 3_600_000 < NOW - 2 * MIN; hour++) {
    const local = zoneParts(hour * 3_600_000, TZ).hour;
    const count = Math.round(HOURLY[local] * scale * (0.4 + random() * 1.2) * 1.5);
    for (let i = 0; i < count; i++) {
      const at = hour * 3_600_000 + Math.floor(random() * 3_600_000);
      if (at > NOW - 2 * MIN || at < first) continue;
      rows.push(draft(frequencyId, at));
    }
  }
  rows.push(draft(frequencyId, NOW - 2 * MIN, true));
  rows.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  rows.forEach((rec, i) => (rec.id = 1000 + rows.length - i));
  return rows;
}

function draft(frequencyId: string, at: number, pending = false): Recording {
  const roll = random();
  const duration = Math.round((roll < 0.12 ? 0.4 + random() : 2 + random() * 13) * 10) / 10;
  const old = NOW - at > 5 * DAY;
  const state: Recording["transcript_state"] = pending ? "pending" : roll < 0.12 ? "empty" : roll < 0.16 ? "failed" : "done";
  return {
    id: 0, frequency_id: frequencyId, aar_channel: 12, feed_id: FEEDS[Math.floor(random() * FEEDS.length)], node_id: null, feed_lat: 38.9231, feed_lon: -77.0412,
    started_at: iso(at), duration_s: duration, audio_bytes: Math.round(duration * 1500), audio_state: old ? "expired" : "ok",
    audio_url: null, transcript: state === "done" ? TEXTS[Math.floor(random() * TEXTS.length)] : "", transcript_state: state, engine: state === "pending" ? "" : "faster-whisper:small.en",
  };
}

const tables = new Map<string, Recording[]>();
for (const [id, scale] of BUSY) tables.set(id, makeRows(id, scale));
for (const rows of tables.values()) for (const rec of rows) rec.audio_url = rec.audio_state === "ok" ? `/api/recordings/${rec.id}/audio` : null;
const all = (): Recording[] => [...tables.values()].flat();

/** UTC ms of local midnight for a YYYY-MM-DD in the corridor's zone */
function dayStart(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 5);
  const hour = zoneParts(guess, TZ).hour; // 0 in winter, 1 in summer time
  return guess - (hour < 12 ? hour : hour - 24) * 3_600_000;
}
const todayKey = (): string => {
  const p = zoneParts(Date.now(), TZ);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

function buckets(frequencyId: string, from: number, count: number, width: number): ActivityBucket[] {
  const rows = tables.get(frequencyId) ?? [];
  return Array.from({ length: count }, (_, i) => {
    const start = from + i * width;
    const inside = rows.filter((rec) => Date.parse(rec.started_at) >= start && Date.parse(rec.started_at) < start + width);
    return { start: iso(start), count: inside.length, airtime_s: Math.round(inside.reduce((sum, rec) => sum + rec.duration_s, 0) * 10) / 10 };
  });
}
const since = (frequencyId: string): string | null => {
  const rows = tables.get(frequencyId);
  return rows?.length ? rows[rows.length - 1].started_at : null;
};

function wav(seconds: number): Buffer {
  const rate = 8000;
  const samples = Math.round(seconds * rate);
  const out = Buffer.alloc(44 + samples);
  out.write("RIFF", 0); out.writeUInt32LE(36 + samples, 4); out.write("WAVEfmt ", 8); out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate, 28);
  out.writeUInt16LE(1, 32); out.writeUInt16LE(8, 34); out.write("data", 36); out.writeUInt32LE(samples, 40);
  for (let i = 0; i < samples; i++) out[44 + i] = 128 + Math.round(40 * Math.sin((i / rate) * 2 * Math.PI * (300 + (i % 4000) / 20)) * (0.5 + 0.5 * Math.sin(i / 900)));
  return out;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function audio(request: IncomingMessage, response: ServerResponse, rec: Recording | undefined): void {
  if (!rec) return json(response, 404, { detail: "no such recording" });
  if (rec.audio_state === "expired") return json(response, 410, { detail: "audio expired" });
  const body = wav(rec.duration_s);
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.range ?? "");
  response.setHeader("Content-Type", "audio/wav");
  response.setHeader("Accept-Ranges", "bytes");
  if (!range) {
    response.setHeader("Content-Length", body.length);
    response.end(body);
    return;
  }
  const start = range[1] ? Number(range[1]) : 0;
  const end = range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
  response.statusCode = 206;
  response.setHeader("Content-Range", `bytes ${start}-${end}/${body.length}`);
  response.setHeader("Content-Length", end - start + 1);
  response.end(body.subarray(start, end + 1));
}

export function fakeRecordings(): Plugin {
  return {
    name: "sdrviz-fake-recordings",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        const path = url.pathname;
        const date = url.searchParams.get("date") ?? todayKey();
        let match: RegExpExecArray | null;

        if (path === "/api/recordings") {
          const id = url.searchParams.get("frequency_id");
          const before = url.searchParams.get("before");
          const limit = Number(url.searchParams.get("limit") ?? 50);
          const rows = (id ? (tables.get(id) ?? []) : all()).filter((rec) => !before || Date.parse(rec.started_at) < Date.parse(before));
          return json(response, 200, rows.slice(0, limit));
        }
        if ((match = /^\/api\/recordings\/(\d+)\/audio$/.exec(path))) return audio(request, response, all().find((rec) => rec.id === Number(match![1])));
        if ((match = /^\/api\/frequencies\/([^/]+)\/activity$/.exec(path))) {
          return json(response, 200, { frequency_id: match[1], date, tz: TZ, recording_since: since(match[1]), buckets: buckets(match[1], dayStart(date), 96, 15 * MIN) });
        }
        if ((match = /^\/api\/frequencies\/([^/]+)\/activity\/week$/.exec(path))) {
          const last = dayStart(date);
          const days = Array.from({ length: 7 }, (_, i) => {
            const start = last - (6 - i) * DAY;
            const p = zoneParts(start + 6 * 3_600_000, TZ);
            const key = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
            return { date: key, hours: buckets(match![1], start, 24, 60 * MIN) };
          });
          return json(response, 200, { frequency_id: match[1], tz: TZ, recording_since: since(match[1]), days });
        }
        return next();
      });
    },
  };
}
