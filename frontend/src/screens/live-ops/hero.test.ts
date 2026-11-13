import { describe, expect, it } from "vitest";
import type { Channel, TxRow } from "$lib/types/live";
import { elsewhereLabel, heroFor, offBankLabel } from "./hero";

const channel = (id: string, aar: string, endT: number | null, tx: Channel["tx"] = null): Channel =>
  ({ id, aar, aar4: aar.slice(2).repeat(2), label: id.toUpperCase(), tx, last_heard: endT == null ? null : { end_t: endT } }) as unknown as Channel;

const row = (id: string, frequencyId: string, aar4: string, startT: number, receptions: string[]): TxRow =>
  ({ id, frequency_id: frequencyId, aar4, label: frequencyId.toUpperCase(), t_offset_s: startT, feed_id: receptions[0], receptions: receptions.map((feed_id) => ({ feed_id })) }) as unknown as TxRow;

const bank = new Set(["a", "b"]);

describe("heroFor", () => {
  it("shows the earliest keyed channel of the bank, with the others listed", () => {
    const active = [row("t2", "b", "0808", 1010, ["feed-lnd"]), row("t1", "a", "5454", 1000, ["feed-bwi"])];
    const channels = [channel("a", "CH54", null, { via: "BWI-03" } as Channel["tx"]), channel("b", "CH08", null)];
    const hero = heroFor({ channels, active, bankIds: bank, now: 1007.4 });
    expect(hero).toMatchObject({ mode: "keyed", aar4: "5454", via: "BWI-03", othersLabel: "+1 · 0808" });
    expect(hero.mode === "keyed" && hero.elapsedS).toBeCloseTo(7.4);
  });

  it("ignores keyed channels outside the bank", () => {
    const hero = heroFor({ channels: [channel("a", "CH54", 990)], active: [row("t", "z", "6666", 1000, ["feed-bay"])], bankIds: bank, now: 1000 });
    expect(hero).toMatchObject({ mode: "idle", aar: "CH54", ageS: 10 });
  });

  it("falls back to the most recently heard channel of the bank", () => {
    const hero = heroFor({ channels: [channel("a", "CH54", 900), channel("b", "CH08", 950)], active: [], bankIds: bank, now: 1000 });
    expect(hero).toMatchObject({ mode: "idle", aar: "CH08", ageS: 50 });
  });

  it("says so when the bank has no channels", () => {
    expect(heroFor({ channels: [], active: [], bankIds: new Set(), now: 0 })).toEqual({ mode: "empty" });
  });
});

describe("off-bank and elsewhere labels", () => {
  const active = [row("t1", "a", "5454", 0, ["feed-lnd"]), row("t2", "z", "6666", 0, ["feed-bay"])];

  it("counts keyed channels outside the bank", () => {
    expect(offBankLabel(active, bank)).toBe("+1 OFF-BANK · 6666");
    expect(offBankLabel([active[0]], bank)).toBeNull();
  });

  it("names the feed that hears what the displayed feed does not", () => {
    expect(elsewhereLabel(active, "feed-lnd", (id) => id.slice(-3).toUpperCase())).toBe("+1 ON BAY");
    expect(elsewhereLabel([active[0]], "feed-lnd", (id) => id)).toBeNull();
  });
});
