/**
 * Parity with the mockup helpers: design/mockups/_shared/hud.js is loaded in a vm sandbox with a
 * stub window, and its formatters, tile resolver, chips, status line and speaker rule are compared
 * with the TypeScript ports on the real scenario data.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import type { LiveState } from "$lib/types/live";
import { headerChips, statusFrom } from "./chips";
import * as fmt from "./fmt";
import { lofarT, rampColor } from "./ramp";
import { roleTag } from "./roles";
import { speaker } from "./speaker";
import { resolveTile, type TileInput } from "./tile";

const root = new URL("../../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const scenario = (name: string): LiveState => JSON.parse(read(`data/sim/scenarios/${name}.json`));
const SCENARIOS = ["listening", "keyed", "fault", "fault-acked"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let HUD: any;

beforeAll(() => {
  const sandbox: Record<string, unknown> = {
    document: { documentElement: { dataset: {} }, currentScript: { src: new URL("design/mockups/_shared/hud.js", root).href } },
    location: { search: "", href: root.href },
    matchMedia: () => ({ matches: false }),
    URL,
    URLSearchParams,
    console,
    setTimeout,
    setInterval,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read("design/mockups/_shared/hud.js"), sandbox);
  HUD = (sandbox as { HUD: unknown }).HUD;
});

describe("formatters match hud.js", () => {
  it("freq, aar, ch, num, dbfs, snr, pct, dur, total, hm, trainId", () => {
    for (const v of [null, 0, 8, 54, 97, 160.92, -47.4, 12.345, 6760, 7.4, 0.04]) {
      expect(fmt.freq(v)).toBe(HUD.fmt.freq(v));
      expect(fmt.aar(v)).toBe(HUD.fmt.aar(v));
      expect(fmt.ch(v)).toBe(HUD.fmt.ch(v));
      expect(fmt.num(v)).toBe(HUD.fmt.num(v));
      expect(fmt.dbfs(v)).toBe(HUD.fmt.dbfs(v));
      expect(fmt.snr(v)).toBe(HUD.fmt.snr(v));
      expect(fmt.pct(v)).toBe(HUD.fmt.pct(v));
      expect(fmt.dur(v)).toBe(HUD.fmt.dur(v));
      expect(fmt.total(v)).toBe(HUD.fmt.total(v));
    }
    for (const id of [null, "Amtrak 53", " marc  410 "]) expect(fmt.trainId(id)).toBe(HUD.fmt.trainId(id));
    for (const t of ["07:00:30", 50850, 3 * 3600 + 5]) expect(fmt.hm(t)).toBe(HUD.fmt.hm(t));
  });

  it("age in both forms", () => {
    for (const s of [null, 0, 9, 48, 60, 72, 599, 600, 3599, 4320, 86399, 183600]) {
      expect(fmt.age(s)).toBe(HUD.fmt.age(s));
      expect(fmt.age(s, "age")).toBe(HUD.fmt.age(s, "age"));
    }
  });

  it("clock in EST and UTC", () => {
    for (const t of ["14:07:30", 0, 86399, 50850.9]) {
      for (const zone of ["EST", "UTC"]) expect(fmt.clock(t, zone)).toBe(HUD.fmt.clock(t, zone));
    }
  });

  it("milepost text", () => {
    for (const mp of ["NEC 113.6", "BAA33.7", "4.2", "≈CFP 85.6", "junk", null]) expect(fmt.mp(mp)).toBe(HUD.fmt.mp(mp));
  });

  it("ramp and lofar mapping", () => {
    for (const t of [-0.2, 0, 0.17, 0.5, 0.93, 1, 1.4]) expect(rampColor(t)).toBe(HUD.rampColor(t));
    for (const db of [-60, -52, -45, -30, -10, 0]) expect(lofarT(db)).toBeCloseTo(HUD.lofarT(db), 10);
  });
});

describe("resolveTile matches hud.js", () => {
  const faultUnacked = { reason: "LINK LOST", acked: false };
  const faultAcked = { reason: "LINK LOST", acked: true };
  const cases: TileInput[] = [
    {},
    { squelch: true },
    { tx: true, elapsed: 7.4, via: "BWI-03" },
    { tx: true, flash: true },
    { tx: true, flash: true, muted: true },
    { fault: faultUnacked },
    { fault: faultAcked },
    { fault: faultAcked, tx: true },
    { coverage: "stale", ageS: 72 },
    { coverage: "offline" },
    { coverage: "offline", offlineLabel: "RECONNECTING" },
    { coverage: "partial", feeds: [true, false, true, true], lastS: 45, via: "LND-02" },
    { lastS: 30 },
    { lastS: 300 },
    { lastS: 900 },
    { reconnecting: true, ageS: 9 },
  ];
  it.each(cases.map((c, i) => [i, c] as const))("case %i", (_i, input) => {
    const ours = resolveTile(input, { aar: 54, label: "AMTK NEC" });
    expect(ours).toEqual(HUD.resolveTile(input, { aar: 54, label: "AMTK NEC" }));
  });
});

describe.each(SCENARIOS)("scenario %s", (name) => {
  it("headerChips match", () => {
    const state = scenario(name);
    for (const txChip of [false, true]) {
      const normalise = (c: { text: string; kind?: string; glyph?: string; onset?: boolean }) => ({ glyph: undefined, onset: undefined, ...c, kind: c.kind ?? "nominal" });
      expect(headerChips(state, { txChip }).map(normalise)).toEqual(HUD.headerChips(state, { txChip }).map(normalise));
    }
  });

  it("statusFrom matches", () => {
    const state = scenario(name);
    const theirs = HUD.statusFrom(state, "FALLBACK");
    const ours = statusFrom(state, "FALLBACK");
    if (!state.status_line.length) return expect(ours.text).toBe(theirs.text);
    const segments = [...theirs.html.matchAll(/<span class="(c-[\w-]+)">([^<]*)<\/span>/g)].map((m) => ({ tone: m[1], text: m[2] }));
    expect(ours.segments).toEqual(segments);
    expect(ours.fault).toBe(theirs.fault);
    expect(ours.acked).toBe(theirs.acked);
  });

  it("statusFrom newestOnly keeps the first entry", () => {
    const state = scenario(name);
    expect(statusFrom(state, "x", { newestOnly: true }).segments).toEqual(statusFrom(state, "x").segments.slice(0, 1));
  });

  it("speaker and role tags match for every transcript row", () => {
    for (const row of scenario(name).transcript.rows) {
      const given = { speaker_role: row.role, train_id: row.train_id, speaker: row.speaker };
      expect(speaker(given)).toEqual(HUD.speaker(given));
      expect(roleTag(row.role)).toBe(HUD.role(row.role));
    }
  });
});
