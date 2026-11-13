import { describe, expect, it } from "vitest";
import { compactChips, headerChips } from "./chips";

const row = (aar: string, off_bank: boolean) => ({ aar, off_bank });
const stateWith = (...active: ReturnType<typeof row>[]) =>
  ({
    header: { feeds_chip: "FEEDS 4/4", feeds_chip_state: "ok", asr_chip: "", disk_chip: "", host_chip: "" },
    faults: [],
    degraded: [],
    system: { decoder: { state: "ok", queue: 0 } },
    active_transmissions: active,
  }) as unknown as Parameters<typeof headerChips>[0];

const keyed = (...active: ReturnType<typeof row>[]) => headerChips(stateWith(...active), { txChip: true }).find((c) => c.kind === "tx")?.text;

describe("KEYED chip", () => {
  it("lists on-bank channels and counts off-bank ones", () => {
    expect(keyed(row("CH54", false), row("CH08", false), row("CH66", true))).toBe("KEYED · CH54 · CH08 · +1 OFF-BANK");
  });

  it("an all off-bank key-up has no empty channel slots", () => {
    expect(keyed(row("CH66", true))).toBe("KEYED · +1 OFF-BANK");
  });
});

describe("compactChips", () => {
  const chips = (...active: ReturnType<typeof row>[]) => headerChips(stateWith(...active), { txChip: true });

  it("shows a KEYED count and keeps the full list in the tooltip", () => {
    const keyed = compactChips(chips(row("CH22", false), row("CH12", false))).find((c) => c.id === "keyed");
    expect(keyed?.text).toBe("KEYED · 2");
    expect(keyed?.title).toBe("KEYED · CH22 · CH12");
  });

  it("counts an off-bank key-up as one", () => {
    expect(compactChips(chips(row("CH22", false), row("CH66", true))).find((c) => c.id === "keyed")?.text).toBe("KEYED · 2");
  });

  it("joins FEEDS and ASR into one chip", () => {
    const out = compactChips(chips());
    expect(out.map((c) => c.text)).toEqual(["FEEDS 4/4 · ASR OK"]);
  });

  it("takes the worse state of the two", () => {
    const state = stateWith();
    state.system.decoder = { state: "fault", queue: 0 } as never;
    const joined = compactChips(headerChips(state)).find((c) => c.id === "feeds");
    expect(joined?.kind).toBe("fault");
  });
});

describe("compactChips with transit chips", () => {
  it("folds them into the FEEDS chip and lists them in the tooltip", () => {
    const transit = [{ id: "transit" as const, text: "AMTRAK WARMING", kind: "degraded" as const }];
    const out = compactChips([...headerChips(stateWith()), ...transit]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ text: "FEEDS 4/4 · ASR OK · TRANSIT", kind: "degraded", title: "AMTRAK WARMING" });
  });
});
