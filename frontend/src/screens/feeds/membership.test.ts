import { describe, expect, it } from "vitest";
import type { Channel, Feed } from "$lib/types/live";
import { membershipColumns } from "./membership";

const channel = (id: string, aar: number, mhz: number) => ({ id, aar: `CH${aar}`, freq_mhz: mhz }) as Channel;

describe("membershipColumns", () => {
  const feeds = [{ id: "feed-lnd", hears: ["a64"] }, { id: "feed-bay", hears: ["b64"] }] as Feed[];

  it("puts the unbanked group at the end of the second column", () => {
    const [first, second] = membershipColumns([channel("a", 8, 160.23), channel("b", 9, 160.245), channel("u", 97, 161.565)], new Set(["a", "b"]), feeds);
    expect(first.items).toHaveLength(2);
    expect(second.items.map((i) => i.kind)).toEqual(["group", "row"]);
  });

  it("sets a shared frequency under one dimension note", () => {
    const [first] = membershipColumns([channel("a64", 64, 161.07), channel("b64", 64, 161.07)], new Set(["a64", "b64"]), feeds);
    expect(first.items.map((i) => i.kind)).toEqual(["row", "row", "note"]);
    expect(first.brackets).toEqual([{ y1: 36, y2: 60, yNote: 84 }]);
    expect(first.items[2]).toEqual({ kind: "note", text: "6464 LND-02 · 6464 BAY-04" });
  });
});
