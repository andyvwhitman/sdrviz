import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LiveState } from "$lib/types/live";
import type { KeyupMessage } from "$lib/ws/protocol";
import { applyMessage } from "./reduce";

const scenario = (name: string): LiveState =>
  JSON.parse(readFileSync(new URL(`../../../../data/sim/scenarios/${name}.json`, import.meta.url), "utf8"));

describe("applyMessage", () => {
  it("tick moves the clock", () => {
    const state = scenario("listening");
    applyMessage(state, { type: "tick", t: 13201, clock: "03:40:01", clock_tenths: "03:40:01.0" });
    expect(state).toMatchObject({ t_offset_s: 13201, clock: "03:40:01" });
  });

  it("channel merges into the channel with that id", () => {
    const state = scenario("listening");
    const id = state.channels[0].id;
    applyMessage(state, { type: "channel", id, state: "squelch", tx: null, last_heard: null, coverage: state.channels[0].coverage, channel_fault: null, status_readout: null });
    expect(state.channels[0].state).toBe("squelch");
  });

  it("lofar_row moves the sparse cells down a row and enters the new values at row 0", () => {
    const state = scenario("listening");
    state.lofar_60m = { row_s: 30, rows: 3, row0: "", cells: { "feed-a": { "54": [[0, -40], [2, -50]] } } };
    applyMessage(state, { type: "lofar_row", t: 1, cells: { "feed-a": { "54": -30, "8": -35 } } });
    expect(state.lofar_60m.cells["feed-a"]).toEqual({ "54": [[0, -30], [1, -40]], "8": [[0, -35]] });
  });

  it("a keyup row carries the receptions of the message", () => {
    const state = scenario("listening");
    const receptions = [{ feed_id: "feed-lnd", snr_db: 20, rssi_dbfs: -30, dist_km: 5 }];
    const row = { ...state.transcript.rows[0], id: "tx-r" } as Record<string, unknown>;
    delete row.receptions;
    applyMessage(state, { type: "keyup", tx_id: "tx-r", channel_id: "x", aar: "CH08", feed_id: "feed-lnd", receptions, role: "crew", role_tag: "CRW", speaker: "", train_id: null, place_id: null, off_bank: false, t: 1, row } as unknown as KeyupMessage);
    expect(state.active_transmissions.at(-1)?.receptions).toEqual(receptions);
  });

  it("keyup adds a live row at the top of the log, keydown ends it, words fill it in", () => {
    const state = scenario("listening");
    const rows = state.transcript.rows.length;
    const count = state.transcript.count_today;
    const row = { ...state.transcript.rows[0], id: "tx-new", state: "decoding" as const, live: true, words: [], transcript: "" };
    const keyup: KeyupMessage = {
      type: "keyup", tx_id: "tx-new", channel_id: "amtk-nec-road", aar: "CH54", feed_id: "feed-lnd", receptions: [], role: "crew",
      role_tag: "CRW", speaker: "MARC 433", train_id: "MARC 433", place_id: null, off_bank: false, t: 13205, row,
    };
    applyMessage(state, keyup);
    expect(state.transcript.rows[0].id).toBe("tx-new");
    expect(state.transcript.rows).toHaveLength(rows + 1);
    expect(state.transcript.count_today).toBe(count + 1);
    expect(state.active_transmissions.map((r) => r.id)).toContain("tx-new");

    applyMessage(state, { type: "words", tx_id: "tx-new", state: "draft", words: [{ w: "Clear", conf: 0.9 }], transcript: "Clear", confidence: 0.9 });
    expect(state.transcript.rows[0]).toMatchObject({ state: "draft", transcript: "Clear" });

    applyMessage(state, { type: "keydown", tx_id: "tx-new", channel_id: "amtk-nec-road", duration_s: 4.2, t: 13209 });
    expect(state.active_transmissions.map((r) => r.id)).not.toContain("tx-new");
    expect(state.transcript.rows[0]).toMatchObject({ live: false, duration_s: 4.2 });
  });

  it("keyup without a row still produces one from the message fields", () => {
    const state = scenario("listening");
    applyMessage(state, { type: "keyup", tx_id: "tx-bare", channel_id: "x", aar: "CH08", feed_id: "feed-bay", receptions: [], role: "crew", role_tag: "CRW", speaker: "CSX Q216", train_id: null, place_id: null, off_bank: true, t: 1 } as unknown as KeyupMessage);
    expect(state.transcript.rows[0]).toMatchObject({ id: "tx-bare", aar: "CH08", off_bank: true, state: "decoding" });
  });

  it("faults replaces the fault set, header and status line", () => {
    const state = scenario("listening");
    const fault = scenario("fault");
    applyMessage(state, { type: "faults", faults: fault.faults, degraded: fault.degraded, header: fault.header, status_line: fault.status_line });
    expect(state.header.feeds_chip).toBe("FEEDS 2/4");
    expect(state.faults).toHaveLength(1);
    expect(state.status_line).toHaveLength(2);
  });

  it("feed patches one feed", () => {
    const state = scenario("listening");
    applyMessage(state, { type: "feed", feed_id: "feed-lnd", state: "fault", label: "FAULT · LINK LOST" });
    expect(state.feeds.find((f) => f.id === "feed-lnd")).toMatchObject({ state: "fault", label: "FAULT · LINK LOST" });
    expect(state.feeds.find((f) => f.id === "feed-alx")?.state).toBe("ok");
  });
});
