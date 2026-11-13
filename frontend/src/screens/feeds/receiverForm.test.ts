import { describe, expect, it } from "vitest";
import { describeStatus, draftFrom, nearbyRates, settingsFrom, validateReceiver, type ReceiverSettings } from "./receiverForm";

const saved: ReceiverSettings = {
  name: "SDR-01 Pi",
  host: "sdr.local",
  port: 1234,
  freq_hz: 160_897_500,
  rate: 1_536_000,
  gain_db: 36.4,
  squelch_db: 8,
  lat: 38.8973,
  lon: -77.0063,
  enabled: true,
};

describe("receiver draft", () => {
  it("round-trips the saved settings", () => expect(settingsFrom(draftFrom(saved))).toEqual(saved));
  it("auto gain is null on the wire", () => {
    const draft = { ...draftFrom(saved), auto_gain: true };
    expect(settingsFrom(draft).gain_db).toBeNull();
    expect(draftFrom({ ...saved, gain_db: null }).auto_gain).toBe(true);
  });
  it("accepts the saved settings", () => expect(validateReceiver(draftFrom(saved))).toEqual({}));
});

describe("sample rate", () => {
  const rateError = (msps: string) => validateReceiver({ ...draftFrom(saved), rate_msps: msps }).rate_msps;
  it("must be a multiple of 48 000", () => {
    expect(rateError("1.0")).toBe("Not a multiple of 0.048; try 0.960 or 1.008");
    expect(rateError("2.4")).toBeUndefined(); // 50 x 48 000
    expect(rateError("1.536")).toBeUndefined();
  });
  it("must be a rate the RTL-SDR has", () => {
    expect(rateError("0.48")).toMatch(/RTL-SDR/);
    expect(rateError("3.456")).toMatch(/RTL-SDR|multiple/);
    expect(rateError("")).toBe("A number");
  });
  it("suggests only rates the hardware can do", () => expect(nearbyRates(1_000_000)).toEqual([960_000, 1_008_000]));
});

describe("validateReceiver", () => {
  const errors = (change: object) => validateReceiver({ ...draftFrom(saved), ...change });
  it("needs a host only while enabled", () => {
    expect(errors({ host: "" }).host).toBe("Required while enabled");
    expect(errors({ host: "", enabled: false }).host).toBeUndefined();
    expect(errors({ host: "bad host!" }).host).toBeDefined();
  });
  it("checks ranges", () => {
    expect(errors({ lat: "95" }).lat).toBeDefined();
    expect(errors({ port: "70000" }).port).toBe("1 to 65535");
    expect(errors({ freq_mhz: "10" }).freq_mhz).toBeDefined();
    expect(errors({ gain_db: "99" }).gain_db).toBeDefined();
    expect(errors({ gain_db: "99", auto_gain: true }).gain_db).toBeUndefined();
  });
});

describe("describeStatus", () => {
  it("names each state", () => {
    expect(describeStatus({ state: "streaming" })).toBe("STREAMING");
    expect(describeStatus({ state: "off" })).toBe("NOT CONFIGURED");
  });
});
