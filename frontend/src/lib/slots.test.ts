import { describe, expect, it } from "vitest";
import type { Frequency } from "$lib/types/frequencies";
import { flipped, slotOf, withSlot } from "./slots";

const f = (assignments: [string, boolean][]): Frequency => ({ id: "x", label: "X", freq_mhz: 160.92, aar_channel: 54, railroad: "", use: "", line: "", mode: "NFM", confidence: "high", notes: "", sources: [], assignments: assignments.map(([feed_id, enabled]) => ({ feed_id, enabled })) });
const rows = [f([["a", true]]), f([["a", false]]), f([["a", true], ["b", true]]), f([])];

describe("slots", () => {
  it("reads on, off and none", () => {
    expect(slotOf(rows[0], "a")).toBe("on");
    expect(slotOf(rows[1], "a")).toBe("off");
    expect(slotOf(rows[3], "a")).toBe("none");
  });

  it("flips on to off and the other two to on", () => {
    expect(flipped("on")).toBe("off");
    expect(flipped("off")).toBe("on");
    expect(flipped("none")).toBe("on");
  });

  it("changes one slot without touching the others", () => {
    expect(withSlot(rows[2], "a", "off").assignments).toEqual([{ feed_id: "a", enabled: false }, { feed_id: "b", enabled: true }]);
    expect(withSlot(rows[3], "b", "on").assignments).toEqual([{ feed_id: "b", enabled: true }]);
    expect(withSlot(rows[2], "b", "none").assignments).toEqual([{ feed_id: "a", enabled: true }]);
  });
});
