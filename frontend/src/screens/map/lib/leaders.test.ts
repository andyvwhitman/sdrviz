import { describe, expect, it } from "vitest";
import type { Rect } from "./geom";
import { chooseQuadrant, labelBox, leaderShape, type LeaderPoint, type Placement, type Quadrant } from "./leaders";

const canvas = { width: 1000, height: 800 };
const at = (id: string, x: number, y: number, labelWidth = 60): LeaderPoint => ({ id, pos: [x, y], labelWidth });
const bare = (id: string, x: number, y: number): LeaderPoint => ({ id, pos: [x, y] });
/** "UR0": quadrant and tier, so the cases read as strings */
type Tag = `${Quadrant}${0 | 1}`;
const place = (t: Tag): Placement => ({ q: t.slice(0, 2) as Quadrant, tier: Number(t[2]) as 0 | 1 });
const tagOf = (p: Placement | undefined): Tag | undefined => p && `${p.q}${p.tier}`;
const pick = (points: LeaderPoint[], prev = new Map<string, Tag>(), avoid: Rect[] = []) =>
  new Map([...chooseQuadrant(points, new Map([...prev].map(([id, t]) => [id, place(t)])), canvas, avoid)].map(([id, p]) => [id, tagOf(p)!]));
/** the label box a train at (x, y) would get in `t` */
const boxOver = (x: number, y: number, t: Tag, width = 60): Rect => labelBox({ id: "a", pos: [x, y], labelWidth: width }, place(t));

describe("chooseQuadrant", () => {
  it("puts an isolated train up and to the right", () => {
    expect(pick([at("a", 500, 400)]).get("a")).toBe("UR0");
  });

  it("only chooses for trains that have a label", () => {
    const out = pick([at("a", 500, 400), bare("b", 520, 410)]);
    expect([...out.keys()]).toEqual(["a"]);
  });

  it("moves down-right when a neighbour sits up-right", () => {
    expect(pick([at("a", 500, 400), at("b", 540, 360)]).get("a")).toBe("DR0");
  });

  it("leans away from neighbours on either side", () => {
    expect(pick([at("a", 500, 400), at("b", 560, 440)]).get("a")).toBe("UR0");
    expect(pick([at("a", 500, 400), at("b", 560, 360), at("c", 560, 440)]).get("a")).toBe("UL0");
  });

  it("breaks ties in the order UR, DR, UL, DL", () => {
    // neighbours straight left and straight right: every quadrant counts both
    expect(pick([at("a", 500, 400), at("b", 450, 400), at("c", 550, 400)]).get("a")).toBe("UR0");
    // up-right and down-right blocked equally: UL comes before DL
    expect(pick([at("a", 500, 400), at("b", 540, 360), at("c", 540, 440)]).get("a")).toBe("UL0");
  });

  it("counts a neighbour at 96 px but not at 97", () => {
    expect(pick([at("a", 500, 400), at("b", 596, 400 - 1e-9)]).get("a")).toBe("DR0");
    expect(pick([at("a", 500, 400), at("b", 597, 399)]).get("a")).toBe("UR0");
  });

  it("counts a neighbour on an axis in both quadrants beside it", () => {
    // straight up: UR and UL are taken, so DR wins
    expect(pick([at("a", 500, 400), at("b", 500, 350)]).get("a")).toBe("DR0");
    // straight right: UR and DR are taken, so UL wins
    expect(pick([at("a", 500, 400), at("b", 550, 400)]).get("a")).toBe("UL0");
  });

  it("counts unlabelled neighbours too", () => {
    expect(pick([at("a", 500, 400), bare("b", 540, 360)]).get("a")).toBe("DR0");
  });

  it("goes up-left at the right edge", () => {
    expect(pick([at("a", 950, 400)]).get("a")).toBe("UL0");
  });

  it("goes down at the top edge and up at the bottom edge", () => {
    expect(pick([at("a", 500, 20)]).get("a")).toBe("DR0");
    expect(pick([at("a", 500, 790)]).get("a")).toBe("UR0");
  });

  it("handles the corners", () => {
    expect(pick([at("a", 20, 20)]).get("a")).toBe("DR0");
    expect(pick([at("a", 980, 790)]).get("a")).toBe("UL0");
    expect(pick([at("a", 980, 20)]).get("a")).toBe("DL0");
  });

  it("a longer label needs more room before it fits", () => {
    const wide = (w: number) => pick([at("a", 800, 400, w)]).get("a");
    expect(wide(60)).toBe("UR0");
    expect(wide(160)).toBe("UL0");
  });

  it("falls back to all quadrants when none fits", () => {
    expect(tagOf(chooseQuadrant([at("a", 50, 50, 900)], new Map(), { width: 100, height: 100 }).get("a"))).toBe("UR0");
  });

  describe("hysteresis", () => {
    // UR holds `n` unlabelled neighbours; every other quadrant is empty; they are near enough to count but clear of the UR label box and diagonal
    const withUr = (n: number) => [at("a", 500, 400), ...Array.from({ length: n }, (_, i) => bare(`n${i}`, 540 + i, 317 - i))];
    const prev = new Map<string, Tag>([["a", "UR0"]]);

    it("holds at a difference of 1", () => {
      expect(pick(withUr(1), prev).get("a")).toBe("UR0");
    });

    it("switches at a difference of 2", () => {
      expect(pick(withUr(2), prev).get("a")).toBe("DR0");
    });

    it("is stable: feeding the result back changes nothing", () => {
      const points = [at("a", 500, 400), at("b", 540, 360), at("c", 520, 430)];
      const first = pick(points);
      expect(pick(points, first)).toEqual(first);
    });

    it("a neighbour wobbling in and out does not flap a label", () => {
      let held = new Map<string, Tag>([["a", "UR0"]]);
      const seen = new Set<string>();
      for (let step = 0; step < 20; step++) {
        held = pick([at("a", 500, 400), bare("b", 540, step % 2 ? 317 : 483)], held);
        seen.add(held.get("a")!);
      }
      expect(seen).toEqual(new Set(["UR0"]));
    });

    it("leaves a previous quadrant that no longer fits, whatever the counts", () => {
      expect(pick([at("a", 950, 400)], new Map<string, Tag>([["a", "UR0"]])).get("a")).toBe("UL0");
    });

    it("ignores the previous quadrants of other ids", () => {
      expect(pick([at("a", 500, 400)], new Map<string, Tag>([["zz", "DL0"]])).get("a")).toBe("UR0");
    });
  });

  it("is deterministic regardless of point order", () => {
    const pts = [at("a", 500, 400), at("b", 540, 360), at("c", 560, 440), at("d", 440, 350)];
    expect(pick([...pts].reverse())).toEqual(pick(pts));
  });
});

describe("obstacles", () => {
  const a = at("a", 500, 400);

  it("a station rect over the UR0 label box sends the label to DR0", () => {
    expect(pick([a], new Map(), [boxOver(500, 400, "UR0")]).get("a")).toBe("DR0");
  });

  it("rects over all four tier-0 boxes send it to UR1", () => {
    const avoid = (["UR0", "DR0", "UL0", "DL0"] as const).map((t) => boxOver(500, 400, t));
    expect(pick([a], new Map(), avoid).get("a")).toBe("UR1");
  });

  it("a train mark on the UR diagonal makes UR0 lose", () => {
    expect(pick([a, bare("b", 530, 370)]).get("a")).not.toBe("UR0");
  });

  it("a previous UR0 that now overlaps a rect moves, whatever the cost difference", () => {
    const prev = new Map<string, Tag>([["a", "UR0"]]);
    expect(pick([a], prev, []).get("a")).toBe("UR0");
    expect(pick([a], prev, [boxOver(500, 400, "UR0")]).get("a")).toBe("DR0");
  });

  it("two trains 20 px apart never get overlapping label boxes", () => {
    for (const [dx, dy] of [[20, 0], [0, 20], [14, 14], [-14, 14], [20, 5]]) {
      const pts = [at("a", 500, 400), at("b", 500 + dx, 400 + dy)];
      const out = chooseQuadrant(pts, new Map(), canvas);
      const [ba, bb] = pts.map((p) => labelBox(p, out.get(p.id)!));
      const touch = ba.x0 < bb.x1 && ba.x1 > bb.x0 && ba.y0 < bb.y1 && ba.y1 > bb.y0;
      expect(touch, `${dx},${dy}`).toBe(false);
    }
  });
});

describe("leaderShape", () => {
  it("runs the diagonal to the elbow at 49.2 and the shelf labelWidth + 8", () => {
    const s = leaderShape("UR", 50);
    expect(s.from).toEqual([9.2, -9.2]);
    expect(s.elbow).toEqual([49.2, -49.2]);
    expect(s.end[0]).toBeCloseTo(107.2);
    expect(s.end[1]).toBe(-49.2);
    expect(s.text[0]).toBeCloseTo(53.2);
    expect(s.text[1]).toBeCloseTo(-53.2);
    expect(s.anchor).toBe("start");
  });

  it("mirrors for the left and the bottom", () => {
    const s = leaderShape("DL", 50);
    expect(s.elbow).toEqual([-49.2, 49.2]);
    expect(s.end[0]).toBeCloseTo(-107.2);
    expect(s.text[0]).toBeCloseTo(-53.2);
    expect(s.text[1]).toBeCloseTo(45.2);
    expect(s.anchor).toBe("end");
  });

  it("scales the lengths with the mark", () => {
    const s = leaderShape("UR", 50, 0.7);
    expect(s.elbow[0]).toBeCloseTo(34.44);
    expect(s.from[0]).toBeCloseTo(6.44);
  });
});

describe("leaderShape tiers", () => {
  it("tier 1 puts the elbow at 73.2", () => {
    const s = leaderShape("UL", 50, 1, 1);
    expect(s.elbow[0]).toBeCloseTo(-73.2);
    expect(s.elbow[1]).toBeCloseTo(-73.2);
  });
});
