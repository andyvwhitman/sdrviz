import { describe, expect, it } from "vitest";
import { chooseQuadrant, leaderShape, type LeaderPoint, type Quadrant } from "./leaders";

const canvas = { width: 1000, height: 800 };
const at = (id: string, x: number, y: number, labelWidth = 60): LeaderPoint => ({ id, pos: [x, y], labelWidth });
const bare = (id: string, x: number, y: number): LeaderPoint => ({ id, pos: [x, y] });
const pick = (points: LeaderPoint[], prev = new Map<string, Quadrant>()) => chooseQuadrant(points, prev, canvas);

describe("chooseQuadrant", () => {
  it("puts an isolated train up and to the right", () => {
    expect(pick([at("a", 500, 400)]).get("a")).toBe("UR");
  });

  it("only chooses for trains that have a label", () => {
    const out = pick([at("a", 500, 400), bare("b", 520, 410)]);
    expect([...out.keys()]).toEqual(["a"]);
  });

  it("moves down-right when a neighbour sits up-right", () => {
    expect(pick([at("a", 500, 400), at("b", 540, 360)]).get("a")).toBe("DR");
  });

  it("leans away from neighbours on either side", () => {
    expect(pick([at("a", 500, 400), at("b", 560, 440)]).get("a")).toBe("UR");
    expect(pick([at("a", 500, 400), at("b", 560, 360), at("c", 560, 440)]).get("a")).toBe("UL");
  });

  it("breaks ties in the order UR, DR, UL, DL", () => {
    // neighbours straight left and straight right: every quadrant counts both
    expect(pick([at("a", 500, 400), at("b", 450, 400), at("c", 550, 400)]).get("a")).toBe("UR");
    // up-right and down-right blocked equally: UL comes before DL
    expect(pick([at("a", 500, 400), at("b", 540, 360), at("c", 540, 440)]).get("a")).toBe("UL");
  });

  it("counts a neighbour at 96 px but not at 97", () => {
    expect(pick([at("a", 500, 400), at("b", 596, 400 - 1e-9)]).get("a")).toBe("DR");
    expect(pick([at("a", 500, 400), at("b", 597, 399)]).get("a")).toBe("UR");
  });

  it("counts a neighbour on an axis in both quadrants beside it", () => {
    // straight up: UR and UL are taken, so DR wins
    expect(pick([at("a", 500, 400), at("b", 500, 350)]).get("a")).toBe("DR");
    // straight right: UR and DR are taken, so UL wins
    expect(pick([at("a", 500, 400), at("b", 550, 400)]).get("a")).toBe("UL");
  });

  it("counts unlabelled neighbours too", () => {
    expect(pick([at("a", 500, 400), bare("b", 540, 360)]).get("a")).toBe("DR");
  });

  it("goes up-left at the right edge", () => {
    expect(pick([at("a", 950, 400)]).get("a")).toBe("UL");
  });

  it("goes down at the top edge and up at the bottom edge", () => {
    expect(pick([at("a", 500, 20)]).get("a")).toBe("DR");
    expect(pick([at("a", 500, 790)]).get("a")).toBe("UR");
  });

  it("handles the corners", () => {
    expect(pick([at("a", 20, 20)]).get("a")).toBe("DR");
    expect(pick([at("a", 980, 790)]).get("a")).toBe("UL");
    expect(pick([at("a", 980, 20)]).get("a")).toBe("DL");
  });

  it("a longer label needs more room before it fits", () => {
    const wide = (w: number) => pick([at("a", 800, 400, w)]).get("a");
    expect(wide(60)).toBe("UR");
    expect(wide(160)).toBe("UL");
  });

  it("falls back to all quadrants when none fits", () => {
    expect(chooseQuadrant([at("a", 50, 50, 900)], new Map(), { width: 100, height: 100 }).get("a")).toBe("UR");
  });

  describe("hysteresis", () => {
    // UR holds `n` unlabelled neighbours; every other quadrant is empty
    const withUr = (n: number) => [at("a", 500, 400), ...Array.from({ length: n }, (_, i) => bare(`n${i}`, 540 + i, 360 - i))];
    const prev = new Map<string, Quadrant>([["a", "UR"]]);

    it("holds at a difference of 1", () => {
      expect(pick(withUr(1), prev).get("a")).toBe("UR");
    });

    it("switches at a difference of 2", () => {
      expect(pick(withUr(2), prev).get("a")).toBe("DR");
    });

    it("is stable: feeding the result back changes nothing", () => {
      const points = [at("a", 500, 400), at("b", 540, 360), at("c", 520, 430)];
      const first = pick(points);
      expect(pick(points, first)).toEqual(first);
    });

    it("a neighbour wobbling in and out does not flap a label", () => {
      let held = new Map<string, Quadrant>([["a", "UR"]]);
      const seen = new Set<Quadrant>();
      for (let step = 0; step < 20; step++) {
        held = pick([at("a", 500, 400), bare("b", 540, step % 2 ? 360 : 440)], held);
        seen.add(held.get("a")!);
      }
      expect(seen).toEqual(new Set(["UR"]));
    });

    it("leaves a previous quadrant that no longer fits, whatever the counts", () => {
      expect(pick([at("a", 950, 400)], new Map([["a", "UR"]])).get("a")).toBe("UL");
    });

    it("ignores the previous quadrants of other ids", () => {
      expect(pick([at("a", 500, 400)], new Map([["zz", "DL"]])).get("a")).toBe("UR");
    });
  });

  it("is deterministic regardless of point order", () => {
    const pts = [at("a", 500, 400), at("b", 540, 360), at("c", 560, 440), at("d", 440, 350)];
    expect(pick([...pts].reverse())).toEqual(pick(pts));
  });
});

describe("leaderShape", () => {
  it("runs the diagonal to the elbow at 37.2 and the shelf labelWidth + 8", () => {
    const s = leaderShape("UR", 50);
    expect(s.from).toEqual([9.2, -9.2]);
    expect(s.elbow).toEqual([37.2, -37.2]);
    expect(s.end[0]).toBeCloseTo(95.2);
    expect(s.end[1]).toBe(-37.2);
    expect(s.text[0]).toBeCloseTo(41.2);
    expect(s.text[1]).toBeCloseTo(-41.2);
    expect(s.anchor).toBe("start");
  });

  it("mirrors for the left and the bottom", () => {
    const s = leaderShape("DL", 50);
    expect(s.elbow).toEqual([-37.2, 37.2]);
    expect(s.end[0]).toBeCloseTo(-95.2);
    expect(s.text[0]).toBeCloseTo(-41.2);
    expect(s.text[1]).toBeCloseTo(33.2);
    expect(s.anchor).toBe("end");
  });

  it("scales the lengths with the mark", () => {
    const s = leaderShape("UR", 50, 0.7);
    expect(s.elbow[0]).toBeCloseTo(26.04);
    expect(s.from[0]).toBeCloseTo(6.44);
  });
});
