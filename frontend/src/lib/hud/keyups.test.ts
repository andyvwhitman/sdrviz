import { describe, expect, it } from "vitest";
import { aarMhz, frameLabel, keyedFor, keyFrames, keyedWords, reconcile, without, type StripEntry } from "./keyups";
import type { TxRow } from "$lib/types/live";

const row = (frequency_id: string, t_offset_s: number, feed_label = "SDR-01"): TxRow =>
  ({ id: `${frequency_id}-${t_offset_s}-${feed_label}`, frequency_id, t_offset_s, clock: "20:13:07.4", aar: "CH54", label: "AMTK NEC", feed_label }) as TxRow;

const NOW = 1000;
const ids = (entries: StripEntry[]): string[] => entries.map((entry) => entry.frame.id);

describe("keyFrames", () => {
  it("orders by key-up start, oldest on the left", () => {
    const frames = keyFrames([row("c", 990), row("a", 900), row("b", 950)], NOW);
    expect(frames.map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  it("makes one frame per frequency: the earliest start wins and every feed goes in via", () => {
    const frames = keyFrames([row("a", 980, "SDR-02"), row("a", 960, "SDR-01")], NOW);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ id: "a", since: 960, via: ["SDR-02", "SDR-01"], startClock: "20:13:07" });
  });

  it("reads a start across midnight as the oldest, never as almost a day (keyAge)", () => {
    const frames = keyFrames([row("a", 86390), row("b", 5)], 20);
    expect(frames.map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("is empty when nothing is keyed", () => {
    expect(keyFrames([], NOW)).toEqual([]);
  });
});

describe("reconcile", () => {
  const frame = (id: string, since: number) => keyFrames([row(id, since)], NOW)[0];

  it("appends a new frame on the right", () => {
    const first = reconcile([], [frame("a", 900)], NOW);
    const next = reconcile(first, [frame("a", 900), frame("b", 990)], NOW);
    expect(ids(next)).toEqual(["a", "b"]);
    expect(next.every((entry) => entry.phase === "live")).toBe(true);
  });

  it("keeps a frame's place when an older one keys later", () => {
    const first = reconcile([], [frame("b", 990)], NOW);
    expect(ids(reconcile(first, [frame("a", 900), frame("b", 990)], NOW))).toEqual(["b", "a"]);
  });

  it("turns a released frame dormant, frozen at its running time, instead of dropping it", () => {
    const first = reconcile([], [frame("a", 900), frame("b", 950)], NOW);
    const next = reconcile(first, [frame("b", 950)], NOW);
    expect(ids(next)).toEqual(["a", "b"]);
    expect(next[0]).toMatchObject({ phase: "dormant", frozenS: 100 });
    expect(next[1].phase).toBe("live");
  });

  it("keeps a dormant frame frozen while the air stays quiet", () => {
    const dormant = reconcile(reconcile([], [frame("a", 900)], NOW), [], NOW);
    expect(reconcile(dormant, [], NOW + 60)[0].frozenS).toBe(100);
  });

  it("sends a frequency that keys again during the hold straight back to live", () => {
    const dormant = reconcile(reconcile([], [frame("a", 900)], NOW), [], NOW);
    const back = reconcile(dormant, [frame("a", 1001)], NOW + 1);
    expect(back[0]).toMatchObject({ phase: "live", frozenS: null });
    expect(back).toHaveLength(1);
  });

  it("closes up: removing a frame from the middle leaves the others in order", () => {
    const all = reconcile([], [frame("a", 900), frame("b", 920), frame("c", 940)], NOW);
    expect(ids(without(all, "b"))).toEqual(["a", "c"]);
  });
});

describe("aarMhz", () => {
  it("reads the AAR table", () => {
    expect(aarMhz("CH54")?.toFixed(3)).toBe("160.920");
    expect(aarMhz("CH96")?.toFixed(3)).toBe("161.550");
    expect(aarMhz("")).toBeNull();
  });
});

describe("readouts", () => {
  it("shows whole seconds", () => {
    expect(keyedFor(12.9)).toBe("0:12");
    expect(keyedFor(65)).toBe("1:05");
    expect(keyedFor(-3)).toBe("0:00");
  });

  it("says the time in words for screen readers", () => {
    expect(keyedWords(1)).toBe("1 second");
    expect(keyedWords(12)).toBe("12 seconds");
    expect(keyedWords(65)).toBe("1 minute 5 seconds");
  });

  it("labels a frame and adds the feeds to the tooltip", () => {
    const [frame] = keyFrames([row("a", 900, "SDR-01"), row("a", 905, "SDR-02")], NOW);
    expect(frameLabel(frame, "160.920", 12)).toBe("160.920 MHz, CH54 AMTK NEC, keyed 12 seconds, since 20:13:07 · open in Live Ops");
    expect(frameLabel(frame, "160.920", 12, { withVia: true })).toMatch(/ · VIA SDR-01, SDR-02$/);
  });
});
