import { describe, expect, it } from "vitest";
import { headerChips } from "./chips";

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
