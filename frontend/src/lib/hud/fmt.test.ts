import { describe, expect, it } from "vitest";
import * as fmt from "./fmt";

describe("fmt", () => {
  it("prints unknown values as the blank, never zero", () => {
    expect(fmt.freq(null)).toBe(fmt.BLANK);
    expect(fmt.dur(undefined)).toBe(fmt.BLANK);
    expect(fmt.num(Number.NaN)).toBe(fmt.BLANK);
  });

  it("formats channels and frequencies", () => {
    expect(fmt.freq(160.92)).toBe("160.920");
    expect(fmt.aar(8)).toBe("0808");
    expect(fmt.ch(54)).toBe("CH54");
    expect(fmt.channelNumber("CH54")).toBe(54);
  });

  it("uses a true minus sign", () => {
    expect(fmt.num(-47.4)).toBe("−47.4");
    expect(fmt.dbfs(-47.4)).toBe("−47.4 dBFS");
  });

  it("formats ages by the spec 2.4 rules", () => {
    expect(fmt.age(48)).toBe("48S");
    expect(fmt.age(240)).toBe("4M");
    expect(fmt.age(72, "age")).toBe("1M 12S");
    expect(fmt.age(1095.4)).toBe("18M"); // LAST drops seconds after the first minute
    expect(fmt.age(4320)).toBe("1H 12M");
    expect(fmt.age(183600)).toBe("2D 3H");
  });

  it("formats durations and totals", () => {
    expect(fmt.dur(7.4)).toBe("00:07.4");
    expect(fmt.total(6760)).toBe("01:52:40");
  });

  it("formats the clock in the zone or UTC", () => {
    expect(fmt.clock("14:07:30")).toBe("14:07:30 EST");
    expect(fmt.clock("14:07:30", "UTC")).toBe("19:07:30 UTC");
    expect(fmt.clock(50850 + 5 * 3600, "UTC")).toBe("00:07:30 UTC"); // wraps past midnight
    expect(fmt.hm("07:00:30")).toBe("07:00");
  });

  it("formats mileposts", () => {
    expect(fmt.mp("NEC 113.6")).toBe("NEC 113.6");
    expect(fmt.mp("BAA33.7")).toBe("BAA 33.7");
    expect(fmt.mp("4.2")).toBe("≈ 4.2");
    expect(fmt.mp("NEC", 113.6)).toBe("NEC 113.6");
    expect(fmt.mpParts("≈CFP 85.6")).toEqual({ prefix: "CFP", num: "85.6", derived: true });
  });

  it("upper-cases train ids", () => {
    expect(fmt.trainId(" Amtrak   53 ")).toBe("AMTRAK 53");
  });
});
