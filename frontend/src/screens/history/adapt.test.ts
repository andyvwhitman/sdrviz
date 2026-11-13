import { describe, expect, it } from "vitest";
import { isoAt, toTxRow, type TransmissionOut } from "./adapt";

const out: TransmissionOut = {
  id: "tx-1",
  t_offset_s: 49684.3,
  clock: "13:48:04",
  frequency_id: "amtk-nec-road",
  aar_channel: 54,
  feed_id: "feed-lnd",
  speaker_role: "crew",
  speaker: "MARC 433 engineer",
  duration_s: 2.3,
  train_id: "MARC 433",
  place_id: "landover-int",
  transcript: "433 approach Landover, track 1.",
  transcript_state: "final",
  confidence: 0.9,
  words: [],
  receptions: [
    { feed_id: "feed-lnd", snr_db: 31, rssi_dbfs: -30, dist_km: 4 },
    { feed_id: "feed-alx", snr_db: 10, rssi_dbfs: -40, dist_km: 20 },
  ],
  detector: null,
  source: "SIM",
  sim: true,
};

describe("isoAt", () => {
  it("reads day-relative seconds on the sim date", () => expect(isoAt(3600, "2026-11-10", "-05:00")).toBe("2026-11-10T06:00:00.000Z"));
  it("reaches the previous day for negative seconds", () => expect(isoAt(-3600, "2026-11-10", "-05:00")).toBe("2026-11-10T04:00:00.000Z"));
});

describe("toTxRow", () => {
  const row = toTxRow(out, { labels: { "amtk-nec-road": "AMTK NEC" }, bank: new Set(["csx-road"]) });
  it("names the channel and flags it off the active bank", () => {
    expect(row).toMatchObject({ aar: "CH54", aar4: "5454", label: "AMTK NEC", off_bank: true, role_tag: "CRW" });
  });
  it("keeps the tenths a float would drop", () => expect(row.clock_tenths).toBe("13:48:04.3"));
  it("counts extra receptions on the feed label", () => expect(row.feed_label).toBe("LND-02 +1"));
});
