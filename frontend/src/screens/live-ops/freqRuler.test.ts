import { describe, expect, it } from "vitest";
import { BAND } from "$lib/hud/band";
import { inkBoxes, METRICS, rulerLayout, scaleLayout, X, type AxisClass, type Box, type RulerItem, type RulerLayout } from "./freqRuler";

const R2 = Math.SQRT1_2;
const BANKS: Record<string, number[]> = {
  NEC: [12, 16, 17, 22, 27, 47, 54, 59],
  Freight: [8, 9, 14, 20, 24, 28, 45, 56, 64, 66, 70, 82, 92, 96],
  Commuter: [8, 9, 14, 20, 54, 56, 59, 96],
  Baltimore: [24, 28, 32, 49, 58, 63, 64, 70, 74],
  Live: [13, 22, 26, 28, 74, 77, 79],
};
const ALL = Array.from({ length: 91 }, (_, i) => i + 7);
const p2 = (n: number): string => String(n).padStart(2, "0");

/** the classes a plot width can be drawn in: under 600 px the phone portrait form, above it desktop and landscape */
const classesFor = (width: number): AxisClass[] => (width < 600 ? ["portrait"] : ["desktop", "landscape"]);
const layoutOf = (width: number, cls: AxisClass, labelled: number[], extras: number[] = []): RulerLayout => rulerLayout({ width, cls, labelled, extras });
const everyItem = (l: RulerLayout): RulerItem[] => [...l.items, ...l.extraSingles];

/** the production fixtures, by the spec's notation: `[a–b]*` is a bracket with non-member slots inside it */
function describeLayout(l: RulerLayout): string {
  const all = everyItem(l).sort((a, b) => a.members[0] - b.members[0]);
  const text = all
    .map((it) => {
      if (it.kind === "single") return p2(it.members[0]);
      const [a, b] = [it.members[0], it.members[it.members.length - 1]];
      return `[${p2(a)}–${p2(b)}]${b - a + 1 > it.members.length ? "*" : ""}`;
    })
    .join(" ");
  return text + (l.bare.length ? `, bare ${l.bare.map(p2).join(" ")}` : "");
}

/** all runs of 2 to 6 from several starts, as the spec's R1 sweeps them */
const runs = (): number[][] => {
  const out: number[][] = [];
  for (let n = 2; n <= 6; n++) for (let s = 7; s + n <= 98; s += 5) out.push(Array.from({ length: n }, (_, i) => s + i));
  return out;
};

const near = (a: Box, b: Box, G: number): boolean => a.u0 < b.u1 + G && b.u0 < a.u1 + G && a.v0 < b.v1 + G && b.v0 < a.v1 + G;
const yTop = (b: Box): number => (b.u1 + b.v1) * R2;
const xRight = (b: Box): number => (b.u1 - b.v0) * R2;

describe("R1 pairwise clear, R2 coverage, R3 tails, R4 brackets, R5 bounds (every integer width 344 to 2560)", () => {
  const sets = [...Object.values(BANKS), ALL, ...runs()];
  it("holds for every bank, all 91 and runs of 2 to 6", () => {
    const bad: string[] = [];
    for (let w = 344; w <= 2560; w++) {
      for (const cls of classesFor(w)) {
        const m = METRICS[cls];
        for (const labelled of sets) {
          const l = layoutOf(w, cls, labelled);
          const boxes = everyItem(l).map((it) => inkBoxes(l, it));
          // R1
          for (let a = 0; a < boxes.length; a++)
            for (let b = a + 1; b < boxes.length; b++)
              if (boxes[a].some((x) => boxes[b].some((y) => near(x, y, m.G - 1e-9)))) bad.push(`R1 ${cls} ${w} ${labelled.join(",")}`);
          // R2
          const seen = [...l.items.flatMap((i) => i.members), ...l.bare].sort((a, b) => a - b);
          if (JSON.stringify(seen) !== JSON.stringify([...new Set(labelled)].sort((a, b) => a - b))) bad.push(`R2 ${cls} ${w}`);
          for (const it of l.items) {
            // R3: the tail starts on the item's own first tick and runs 45 degrees by t
            const x0 = X(it.members[0], w);
            const up = (y: number): number => l.height - y;
            if (it.tail.a.x !== x0 || it.tail.a.y !== up(m.tick) || it.tail.b.x - it.tail.a.x !== m.t || it.tail.a.y - it.tail.b.y !== m.t) bad.push(`R3 ${cls} ${w}`);
            // R4
            if (it.kind === "bracket") {
              const last = it.members[it.members.length - 1];
              if (it.members.length < 2 || it.rule!.a.x !== x0 || it.rule!.b.x !== X(last, w) || it.rule!.a.y !== up(m.ruleY)) bad.push(`R4 rule ${cls} ${w}`);
              for (const t of l.ticks) {
                if (it.members.includes(t.ch) && t.length < m.ruleY + 3) bad.push(`R4 member ${cls} ${w} ${t.ch}`);
                if (!it.members.includes(t.ch) && t.x >= x0 && t.x <= X(last, w) && t.length > 3) bad.push(`R4 inside ${cls} ${w} ${t.ch}`);
              }
            }
          }
          // R5
          for (const group of boxes) for (const b of group) if (yTop(b) > m.H - 2 + 1e-9 || xRight(b) > w + m.M + 1e-6) bad.push(`R5 ${cls} ${w} ${labelled.join(",")}`);
          if (bad.length > 5) throw new Error(bad.slice(0, 5).join("\n"));
        }
      }
    }
    expect(bad).toEqual([]);
  }, 120_000);
});

describe("R7 extras are additive", () => {
  it("adding an extra never moves a bank item", () => {
    for (const [w, cls] of [[1114, "desktop"], [1744, "desktop"], [726, "landscape"], [374, "portrait"]] as const) {
      for (const labelled of Object.values(BANKS)) {
        const base = layoutOf(w, cls, labelled);
        for (let e = BAND.first; e <= BAND.last; e++) {
          const l = layoutOf(w, cls, labelled, [e]);
          expect(l.items).toEqual(base.items);
          expect(l.bare).toEqual(base.bare);
        }
      }
    }
  });

  it("an extra that would collide becomes a bare tick, one that fits a single", () => {
    const freight = layoutOf(1114, "desktop", BANKS.Freight, [60]);
    expect(freight.extraSingles.map((i) => i.members[0])).toEqual([60]);
    const tight = layoutOf(1114, "desktop", BANKS.Freight, [10]);
    expect(tight.bareExtras).toEqual([10]);
    expect(tight.ticks.find((t) => t.ch === 10)).toMatchObject({ length: 12, role: "bare" });
  });
});

describe("R8 strokes clear text", () => {
  it("no tick, rule or tail (a selected member's two extra px included) touches any text ink", () => {
    const hits: string[] = [];
    for (const [w, cls] of [[1114, "desktop"], [1744, "desktop"], [726, "landscape"], [374, "portrait"]] as const) {
      for (const labelled of [...Object.values(BANKS), ALL]) {
        const l = layoutOf(w, cls, labelled);
        const ink = everyItem(l).flatMap((it) => inkBoxes(l, it));
        const inside = (x: number, yUp: number): boolean => {
          const u = (x + yUp) * R2;
          const v = (yUp - x) * R2;
          return ink.some((b) => u > b.u0 && u < b.u1 && v > b.v0 && v < b.v1);
        };
        const sample = (x0: number, y0: number, x1: number, y1: number, label: string) => {
          for (let s = 0; s <= 20; s++) if (inside(x0 + ((x1 - x0) * s) / 20, y0 + ((y1 - y0) * s) / 20)) hits.push(`${cls} ${w} ${label}`);
        };
        const m = l.m;
        for (const t of l.ticks) sample(t.x, 0, t.x, t.length + (t.role === "member" || t.role === "bare" ? 2 : 0), `tick ${t.ch}`);
        for (const it of everyItem(l)) {
          sample(it.tail.a.x, l.height - it.tail.a.y, it.tail.b.x, l.height - it.tail.b.y, `tail ${it.members[0]}`);
          if (it.rule) sample(it.rule.a.x, m.ruleY, it.rule.b.x, m.ruleY, `rule ${it.members[0]}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("R9 scale strip", () => {
  it("numerals do not overlap, stay inside the plot, and hang from the true tick", () => {
    for (let w = 344; w <= 2560; w += 7) {
      for (const cls of classesFor(w)) {
        const m = METRICS[cls];
        const half = (7 * m.adv) / 2;
        const list = scaleLayout(w, m.f);
        expect(list.length).toBeGreaterThan(2);
        list.forEach((n, i) => {
          expect(n.x).toBe(X(n.ch, w));
          expect(n.textX - half).toBeGreaterThanOrEqual(0);
          expect(n.textX + half).toBeLessThanOrEqual(w);
          if (i > 0) expect(n.textX - half).toBeGreaterThan(list[i - 1].textX + half);
        });
      }
    }
  });

  it("phone portrait uses every 20 channels; a wide desktop every 10", () => {
    expect(scaleLayout(374, 13).map((n) => n.ch)).toEqual([10, 30, 50, 70, 90]);
    expect(scaleLayout(1744, 11).map((n) => n.text)[0]).toBe("160.260");
    expect(scaleLayout(1744, 11)).toHaveLength(9);
  });
});

describe("R10 fixtures (production banks)", () => {
  const want: Record<string, Record<string, string>> = {
    "1280": {
      NEC: "12 [16–17] 22 27 47 54 59",
      Freight: "[08–09] 14 20 24 28 45 56 64 66 70 82 92 96",
      Commuter: "[08–09] 14 20 54 56 59 96",
      Baltimore: "24 28 32 49 58 [63–64] 70 74",
      Live: "13 22 26 28 74 77 79",
    },
    Landscape: {
      NEC: "12 [16–17] 22 27 47 54 59",
      Freight: "[08–09] 14 20 24 28 45 56 [64–66]* 70 82 92 96",
      Commuter: "[08–09] 14 20 [54–59]* 96",
      Baltimore: "24 28 32 49 58 [63–64] 70 74",
      Live: "13 22 [26–28]* 74 [77–79]*",
    },
    Portrait: {
      NEC: "[12–22]* 27 47 54 59",
      Freight: "[08–14]* [20–28]* 45 56 [64–70]* 82, bare 92 96",
      Commuter: "[08–14]* 20 [54–59]*, bare 96",
      Baltimore: "[24–32]* 49 58 [63–70]* 74",
      Live: "13 [22–28]* [74–79]*",
    },
  };
  const cases: [string, number, AxisClass][] = [["1280", 1114, "desktop"], ["Landscape", 726, "landscape"], ["Portrait", 374, "portrait"]];
  for (const [name, width, cls] of cases)
    for (const [bank, labelled] of Object.entries(BANKS))
      it(`${name} ${bank}`, () => expect(describeLayout(layoutOf(width, cls, labelled))).toBe(want[name][bank]));

  it("1920 and 2560 are all singles", () => {
    for (const w of [1744, 2374]) for (const labelled of Object.values(BANKS)) expect(describeLayout(layoutOf(w, "desktop", labelled))).toBe(labelled.map(p2).join(" "));
  });

  it("all 91: singles on a wide desktop, brackets of 3 at 1280, of 6 in landscape, of 11 in portrait with 84 to 97 bare", () => {
    const sizes = (l: RulerLayout): number[] => [...new Set(l.items.filter((i) => i.kind === "bracket").map((i) => i.members.length))];
    expect(layoutOf(1744, "desktop", ALL).items.every((i) => i.kind === "single")).toBe(true);
    expect(layoutOf(2374, "desktop", ALL).items).toHaveLength(91);
    const w1280 = layoutOf(1114, "desktop", ALL);
    expect([w1280.items.filter((i) => i.kind === "bracket").length, sizes(w1280)]).toEqual([30, [3]]);
    expect(w1280.items.at(-1)!.members).toEqual([97]);
    const land = layoutOf(726, "landscape", ALL);
    expect([land.items.filter((i) => i.kind === "bracket").length, sizes(land)]).toEqual([15, [6]]);
    const port = layoutOf(374, "portrait", ALL);
    expect([port.items.length, sizes(port), port.bare[0], port.bare.at(-1)]).toEqual([7, [11], 84, 97]);
    expect(port.items[0].members).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  it("the plot width of an 844 phone does not change the landscape fixtures from 690 to 734", () => {
    for (let w = 690; w <= 734; w++) for (const [bank, labelled] of Object.entries(BANKS)) expect(describeLayout(layoutOf(w, "landscape", labelled))).toBe(want.Landscape[bank]);
  });
});
