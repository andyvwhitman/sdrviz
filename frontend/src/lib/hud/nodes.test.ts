import { describe, expect, it } from "vitest";
import { BLANK } from "./fmt";
import { NODE_CHIP, formatLag, isHighLag, linkLabel, linkSteps } from "./nodes";

describe("linkLabel", () => {
  it("names the band of a quality", () => {
    expect(linkLabel(95)).toBe("GOOD");
    expect(linkLabel(70)).toBe("GOOD");
    expect(linkLabel(69)).toBe("FAIR");
    expect(linkLabel(40)).toBe("FAIR");
    expect(linkLabel(39)).toBe("POOR");
    expect(linkLabel(0)).toBe("POOR");
  });
  it("is blank without a link", () => {
    expect(linkLabel(null)).toBe(BLANK);
  });
});

describe("linkSteps", () => {
  it("lights 0 to 5 of the meter steps", () => {
    expect([null, 0, 1, 20, 21, 50, 80, 81, 100].map(linkSteps)).toEqual([0, 0, 1, 1, 2, 3, 4, 5, 5]);
  });
});

describe("formatLag", () => {
  it("is ms under a second and seconds above", () => {
    expect(formatLag(240)).toBe("240 ms");
    expect(formatLag(999.6)).toBe("1.0 s");
    expect(formatLag(1000)).toBe("1.0 s");
    expect(formatLag(1840)).toBe("1.8 s");
    expect(formatLag(null)).toBe(BLANK);
  });
  it("flags a second or more", () => {
    expect(isHighLag(999)).toBe(false);
    expect(isHighLag(1000)).toBe(true);
    expect(isHighLag(null)).toBe(false);
  });
});

describe("NODE_CHIP", () => {
  it("covers every state and never uses the ember or fault looks", () => {
    expect(Object.keys(NODE_CHIP).sort()).toEqual(["OFFLINE", "ONLINE", "PENDING", "REVOKED"]);
    for (const kind of Object.values(NODE_CHIP)) expect(["tx", "fault"]).not.toContain(kind);
  });
  it("makes an offline node dimmer than an online one", () => {
    expect(NODE_CHIP.ONLINE).toBe("active");
    expect(NODE_CHIP.OFFLINE).toBe("offline");
  });
});
