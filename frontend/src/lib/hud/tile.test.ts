import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Channel, LiveState } from "$lib/types/live";
import { resolveTile, sharedFrequencySuffix, tileInputFrom } from "./tile";

describe("resolveTile", () => {
  it("an unacknowledged fault wins the frame", () => {
    const r = resolveTile({ tx: true, fault: { reason: "LINK LOST", acked: false } });
    expect(r.frame).toBe("fault");
    expect(r.glyph).toBe("fault");
    expect(r.reason).toBe("FAULT · LINK LOST");
  });

  it("an acknowledged fault drops to the stale frame but keeps the fault glyph", () => {
    const r = resolveTile({ fault: { reason: "LINK LOST", acked: true } });
    expect(r.frame).toBe("stale");
    expect(r.glyph).toBe("fault");
  });

  it("keyed is tx with a wash; the commit flash is hot unless muted", () => {
    expect(resolveTile({ tx: true }).frame).toBe("tx");
    expect(resolveTile({ tx: true, flash: true }).frame).toBe("tx-flash");
    expect(resolveTile({ tx: true, flash: true, muted: true }).frame).toBe("tx");
    expect(resolveTile({ tx: true }).wash).toBe(true);
  });

  it("the ember fades from recent to recent-dim to nothing", () => {
    expect(resolveTile({ lastS: 30 }).ember).toBe("recent");
    expect(resolveTile({ lastS: 300 }).ember).toBe("recent-dim");
    expect(resolveTile({ lastS: 900 }).ember).toBeNull();
    expect(resolveTile({ lastS: 300 }).status).toEqual({ text: "LAST 5M", cls: "is-dim" });
  });

  it("stale and offline coverage read AGE and the offline label", () => {
    expect(resolveTile({ coverage: "stale", ageS: 72 }).status.text).toBe("AGE 1M 12S");
    expect(resolveTile({ coverage: "offline" }).status.text).toBe("NO FEEDS");
    expect(resolveTile({ coverage: "offline", offlineLabel: "DISABLED" }).status.text).toBe("DISABLED");
  });

  it("describes the tile for assistive tech", () => {
    const r = resolveTile({ tx: true, elapsed: 7.4, via: "BWI-03" }, { aar: 54, label: "AMTK NEC" });
    expect(r.aria).toBe("Channel 54, AMTK NEC, transmitting, 7 seconds, via BWI-03");
  });
});

describe("tileInputFrom", () => {
  const scenario = (name: string): LiveState =>
    JSON.parse(readFileSync(new URL(`../../../../data/sim/scenarios/${name}.json`, import.meta.url), "utf8"));

  it("a keyed channel carries its timer, via feed and primary-reception level", () => {
    const state = scenario("keyed");
    const feeds = Object.fromEntries(state.feeds.map((f) => [f.id, f]));
    const keyed = state.channels.find((c) => c.id === "amtk-nec-road")!;
    const input = tileInputFrom(keyed, { feeds, displayedFeed: state.displayed_feed });
    expect(input).toMatchObject({ tx: true, elapsed: 7.4, via: "BWI-03", coverage: keyed.coverage.state });
    expect(input.meter?.db).toBe(-34.4); // BWI-03, the primary reception
    expect(input.meter?.peak).toBe(-34.4);
    expect(resolveTile(input).frame).toBe("tx");
  });

  it("a stale-coverage channel reads the age of its freshest feed sample", () => {
    const state = scenario("fault");
    const feeds = Object.fromEntries(state.feeds.map((f) => [f.id, f]));
    const stale = state.channels.find((c) => c.coverage.state === "stale");
    if (!stale) return;
    const input = tileInputFrom(stale, { feeds, displayedFeed: state.displayed_feed });
    expect(input.ageS).toBeGreaterThan(0);
    expect(resolveTile(input).status.cls).toBe("is-stale");
  });

  it("a dropped link freezes values and reads AGE from the drop", () => {
    const state = scenario("listening");
    const feeds = Object.fromEntries(state.feeds.map((f) => [f.id, f]));
    const input = tileInputFrom(state.channels[0], { feeds, displayedFeed: state.displayed_feed, linkDropAgeS: 9 });
    expect(resolveTile(input).status).toEqual({ text: "AGE 9S", cls: "is-stale" });
  });

  it("marks selected, muted and solo from the context", () => {
    const state = scenario("listening");
    const feeds = Object.fromEntries(state.feeds.map((f) => [f.id, f]));
    const id = state.channels[0].id;
    const input = tileInputFrom(state.channels[0], { feeds, displayedFeed: state.displayed_feed, selectedId: id, muted: new Set([id]), solo: new Set() });
    expect(input).toMatchObject({ selected: true, muted: true, solo: false });
  });
});

describe("sharedFrequencySuffix", () => {
  it("names the feed when two channels share a frequency and only one feed hears this one", () => {
    const base = { id: "a", freq_mhz: 160.9, heard_by: ["feed-lnd"] };
    const twin = { id: "b", freq_mhz: 160.9, heard_by: ["feed-alx", "feed-lnd"] };
    const other = { id: "c", freq_mhz: 161.1, heard_by: ["feed-lnd"] };
    const feedLabel = (id: string) => id.toUpperCase();
    expect(sharedFrequencySuffix(base as Channel, [base, twin, other] as Channel[], feedLabel)).toBe("FEED-LND");
    expect(sharedFrequencySuffix(twin as Channel, [base, twin, other] as Channel[], feedLabel)).toBe("");
    expect(sharedFrequencySuffix(other as Channel, [base, twin, other] as Channel[], feedLabel)).toBe("");
  });
});
