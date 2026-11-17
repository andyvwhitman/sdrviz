import { describe, expect, it } from "vitest";
import type { NodeEvent, NodeHealth } from "$lib/types/nodes";
import { HISTORY_MS, appendSample, commandText, eventTime, nodeFaults, reconnectsLastHour } from "./nodeHealth";

const health = (over: Partial<NodeHealth> = {}): NodeHealth => ({
  cpu_pct: 30, temp_c: 55, rtl_tcp: "connected", dropped_blocks: 0, audio_age_ms: 100, uptime_s: 1000, channels: 91,
  tune: { center_hz: 1, rate: 1, gain_db: null, squelch_db: 8 }, ...over,
});

describe("appendSample", () => {
  it("adds samples in order and does not change its input", () => {
    const first = appendSample(undefined, { t: 1000, link: 90, lag: 200 });
    const second = appendSample(first, { t: 6000, link: 80, lag: 250 });
    expect(first).toHaveLength(1);
    expect(second.map((s) => s.t)).toEqual([1000, 6000]);
  });
  it("drops samples older than 30 minutes", () => {
    let history = appendSample(undefined, { t: 0, link: 1, lag: 1 });
    history = appendSample(history, { t: HISTORY_MS - 1, link: 2, lag: 2 });
    expect(history.map((s) => s.t)).toEqual([0, HISTORY_MS - 1]);
    history = appendSample(history, { t: HISTORY_MS + 5, link: 3, lag: 3 });
    expect(history.map((s) => s.link)).toEqual([2, 3]);
  });
});

describe("nodeFaults", () => {
  it("is empty for a healthy node and for no report", () => {
    expect(nodeFaults(health())).toEqual([]);
    expect(nodeFaults(null)).toEqual([]);
  });
  it("flags rtl_tcp down", () => {
    expect(nodeFaults(health({ rtl_tcp: "down" }))).toEqual(["RTL_TCP DOWN"]);
    expect(nodeFaults(health({ rtl_tcp: "connecting" }))).toEqual([]);
  });
  it("flags a temperature over 80 C, not 80 itself or an unknown one", () => {
    expect(nodeFaults(health({ temp_c: 80.4 }))).toEqual(["TEMPERATURE 80 C"]);
    expect(nodeFaults(health({ temp_c: 80 }))).toEqual([]);
    expect(nodeFaults(health({ temp_c: null }))).toEqual([]);
  });
  it("lists both", () => {
    expect(nodeFaults(health({ rtl_tcp: "down", temp_c: 85 }))).toHaveLength(2);
  });
});

describe("reconnectsLastHour", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  const ev = (t: string, kind: NodeEvent["kind"]): NodeEvent => ({ t, kind, detail: "" });
  it("counts reconnect events within the hour only", () => {
    const events = [ev("2026-11-17T11:30:00Z", "reconnect"), ev("2026-11-17T10:30:00Z", "reconnect"), ev("2026-11-17T11:59:00Z", "online")];
    expect(reconnectsLastHour(events, now)).toBe(1);
  });
});

describe("eventTime", () => {
  it("is day/month and the Eastern clock", () => {
    expect(eventTime("2026-11-17T12:05:00Z")).toBe("17/11 07:05");
  });
  it("is blank for nonsense", () => {
    expect(eventTime("not a time")).toBe("— — —");
  });
});

describe("commandText", () => {
  it("tells the three outcomes apart", () => {
    expect(commandText({ status: "acked", error: null })).toBe("ACKED");
    expect(commandText({ status: "timeout", error: null })).toBe("NO ANSWER IN TIME");
    expect(commandText({ status: "failed", error: { message: "bad value" } })).toBe("FAILED · bad value");
  });
});
