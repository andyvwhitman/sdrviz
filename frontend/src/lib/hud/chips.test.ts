import { describe, expect, it } from "vitest";
import { compactChips, headerChips } from "./chips";

const row = (aar: string) => ({ aar });
const stateWith = (...active: ReturnType<typeof row>[]) =>
  ({
    header: { feeds_chip: "FEEDS 4/4", feeds_chip_state: "ok", asr_chip: "", disk_chip: "", host_chip: "" },
    faults: [],
    degraded: [],
    system: { decoder: { state: "ok", queue: 0 } },
    active_transmissions: active,
  }) as unknown as Parameters<typeof headerChips>[0];

describe("no KEYED chip", () => {
  it("never adds a chip for what is on the air (the footer's key-up strip shows it)", () => {
    const state = stateWith(row("CH54"), row("CH08"));
    expect(headerChips(state).some((c) => c.kind === "tx" || c.text.startsWith("KEYED"))).toBe(false);
  });
});

describe("compactChips", () => {
  const chips = (...active: ReturnType<typeof row>[]) => headerChips(stateWith(...active));

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
