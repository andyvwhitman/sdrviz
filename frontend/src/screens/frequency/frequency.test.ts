import { describe, expect, it } from "vitest";
import type { Recording } from "$lib/types/recordings";
import { backoffS, beforeAt, clockOf, dayHeading, dayKey, dayName, findByStart, logItems, nextNewer, transcriptKind } from "./frequency";

const NY = "America/New_York";

function rec(id: number, startedAt: string, extra: Partial<Recording> = {}): Recording {
  return {
    id, frequency_id: "f", aar_channel: 12, feed_id: "node-1", feed_lat: null, feed_lon: null, started_at: startedAt, duration_s: 5,
    audio_bytes: 100, audio_state: "ok", audio_url: `/api/recordings/${id}/audio`, transcript: "hello", transcript_state: "done", engine: "x", ...extra,
  };
}

describe("local time", () => {
  it("prints the clock and day in the zone, not UTC", () => {
    expect(clockOf("2026-11-17T19:03:05.000Z", NY)).toBe("14:03:05");
    expect(dayKey("2026-11-18T03:30:00Z", NY)).toBe("2026-11-17");
  });
  it("names days", () => {
    expect(dayName("2026-11-17")).toBe("TUE 17 NOV");
    expect(dayHeading("2026-11-17", "2026-11-17")).toBe("TODAY · TUE 17 NOV");
    expect(dayHeading("2026-11-16", "2026-11-17")).toBe("MON 16 NOV");
  });
});

describe("transcriptKind", () => {
  it("maps the four states and treats blank text as no speech", () => {
    expect(transcriptKind(rec(1, "2026-11-17T19:00:00Z"))).toBe("text");
    expect(transcriptKind(rec(1, "2026-11-17T19:00:00Z", { transcript: "  ", transcript_state: "done" }))).toBe("empty");
    expect(transcriptKind(rec(1, "2026-11-17T19:00:00Z", { transcript_state: "pending" }))).toBe("pending");
    expect(transcriptKind(rec(1, "2026-11-17T19:00:00Z", { transcript_state: "failed" }))).toBe("failed");
  });
});

describe("logItems", () => {
  it("adds a divider at each date change and one expired note", () => {
    const rows = [
      rec(3, "2026-11-17T19:00:00Z"),
      rec(2, "2026-11-17T04:00:00Z", { audio_state: "expired", audio_url: null }),
      rec(1, "2026-11-16T15:00:00Z", { audio_state: "expired", audio_url: null }),
    ];
    const kinds = logItems(rows, NY, "2026-11-17").map((i) => (i.kind === "day" ? i.label : i.kind === "row" ? `#${i.rec.id}` : i.kind));
    expect(kinds).toEqual(["TODAY · TUE 17 NOV", "#3", "MON 16 NOV", "expired-note", "#2", "#1"]);
  });
});

describe("paging helpers", () => {
  it("finds the linked row and pages from one second after it", () => {
    const rows = [rec(2, "2026-11-17T19:07:33.500Z"), rec(1, "2026-11-17T19:00:00.000Z")];
    expect(findByStart(rows, "2026-11-17T19:07:33.500Z")?.id).toBe(2);
    expect(findByStart(rows, "junk")).toBeUndefined();
    expect(beforeAt("2026-11-17T19:07:33.500Z")).toBe("2026-11-17T19:07:34.500Z");
  });
  it("continuous play goes to the next newer playable row", () => {
    const rows = [rec(3, "2026-11-17T19:02:00Z"), rec(2, "2026-11-17T19:01:00Z", { audio_state: "expired", audio_url: null }), rec(1, "2026-11-17T19:00:00Z")];
    expect(nextNewer(rows, 1)?.id).toBe(3);
    expect(nextNewer(rows, 3)).toBeUndefined();
  });
  it("backs off 1, 2, 4, 8 s and stays there", () => {
    expect([0, 1, 2, 3, 9].map(backoffS)).toEqual([1, 2, 4, 8, 8]);
  });
});
