/**
 * The label pass against the mockup: for each scenario and size, the names kept per row and the gaps
 * between them must equal what design/mockups/live-ops.js printed (html[data-ctc-audit]), using the
 * text widths Chromium measured there (fixtures/mockup-ctc.json). Regenerate the fixture with the
 * wrapper described in docs/requests/live-ops.md if the mockup changes.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/mockup-ctc.json";
import { GAP_PX, KNOCKOUT_PX, labelPass, type LabelCandidate, type LabelFont } from "./labelPass";
import { blocksFor, labelCandidates, layoutCtc, type CtcLive, type RoutesDoc } from "./layout";

const dataPath = (relative: string) => new URL(`../../../../../data/sim/${relative}`, import.meta.url);
const routes = JSON.parse(readFileSync(dataPath("routes.json"), "utf8")) as RoutesDoc;
const ctcOf = (scenario: string) => JSON.parse(readFileSync(dataPath(`scenarios/${scenario}.json`), "utf8")).ctc as Record<string, CtcLive>;

const SIZES = { 1920: { width: 1856, x0: 144 }, 1440: { width: 1376, x0: 120 } } as const;
const SCENARIOS = ["listening", "keyed", "fault", "fault-acked"];

type Fixture = { widths: Record<string, number>; audit: { row: string; names: string[]; gaps: number[] }[] };
const fixture = (key: string) => (fixtures as Record<string, Fixture>)[key];

describe("CTC label pass matches the mockup", () => {
  for (const scenario of SCENARIOS) {
    for (const [size, { width, x0 }] of Object.entries(SIZES)) {
      it(`${scenario} at ${size}`, () => {
        const expected = fixture(`${scenario}-${size}`);
        const layout = layoutCtc(routes, width, x0);
        const candidates = labelCandidates(layout, blocksFor(layout, ctcOf(scenario)));
        const measure = (text: string, font: LabelFont) => {
          const w = expected.widths[`${font}|${text}`];
          if (w == null) throw new Error(`no measured width for ${font}|${text}`);
          return w;
        };
        const { audit } = labelPass(candidates, { width, tieXs: layout.ties.map((t) => t.x), measure });
        expect(audit.map((a) => ({ row: String(a.row), names: a.names, gaps: a.gaps }))).toEqual(expected.audit);
      });
    }
  }
});

describe("label pass rules", () => {
  const measure = (text: string) => text.length * 7;
  const label = (over: Partial<LabelCandidate>): LabelCandidate => ({ row: 0, priority: 4, text: "STATION", font: "station", x: 100, anchor: "middle", ...over });

  it("keeps the higher priority label when two collide", () => {
    const { placed } = labelPass([label({ text: "LOW", priority: 4 }), label({ text: "HIGH", priority: 1, font: "train" })], { width: 400, tieXs: [], measure });
    expect(placed.map((p) => p.text)).toEqual(["HIGH"]);
  });

  it("separates labels by 8 px, and by 16 px when a tie runs between them", () => {
    const at = (x: number) => label({ text: "AAAA", x, priority: 4 });
    // two 28 px labels centred 28 + 2 * 2 + 8 = 40 px apart just fit
    expect(labelPass([at(100), at(140)], { width: 400, tieXs: [], measure }).placed).toHaveLength(2);
    expect(labelPass([at(100), at(139)], { width: 400, tieXs: [], measure }).placed).toHaveLength(1);
    // a tie between them doubles the gap to 16 px
    expect(labelPass([at(100), at(140)], { width: 400, tieXs: [120], measure }).placed).toHaveLength(1);
    expect(labelPass([at(100), at(148)], { width: 400, tieXs: [124], measure }).placed).toHaveLength(2);
  });

  it("sets a label that sits on a tie beside it: left first, then right", () => {
    const tied = label({ text: "TIED", tie: 200, x: 200 });
    const left = labelPass([tied], { width: 400, tieXs: [200], measure }).placed[0];
    expect(left.anchor).toBe("end");
    expect(left.x).toBe(200 - GAP_PX);
    const blocker = label({ text: "BLOCKER", x: 160, priority: 0 });
    const right = labelPass([blocker, tied], { width: 400, tieXs: [200], measure }).placed.find((p) => p.text === "TIED")!;
    expect(right.anchor).toBe("start");
    expect(right.x).toBe(200 + GAP_PX);
  });

  it("uses the short form when the full name exceeds its reach, and drops it when that does too", () => {
    const long = label({ text: "WASHINGTON UNION", short: "WASHINGTON", reach: [50, 50] });
    expect(labelPass([long], { width: 400, tieXs: [], measure }).placed[0].text).toBe("WASHINGTON"); // 70 px wide, reach 100 total
    const tight = label({ text: "WASHINGTON UNION", short: "WASHINGTON", reach: [20, 20] });
    expect(labelPass([tight], { width: 400, tieXs: [], measure }).placed).toHaveLength(0);
  });

  it("keeps text inside the strip", () => {
    expect(labelPass([label({ x: 5 })], { width: 400, tieXs: [], measure }).placed).toHaveLength(0);
  });

  it("puts the talking glyph 5 px before the train id and counts it in the extent", () => {
    const train = label({ text: "MARC 433", font: "train", talking: true, priority: 1 });
    const [placed] = labelPass([train], { width: 400, tieXs: [], measure }).placed;
    expect(placed.dotX).toBe(placed.textBox.left - 5);
    expect(placed.extent[0]).toBeLessThan(placed.textBox.left - KNOCKOUT_PX);
  });
});
