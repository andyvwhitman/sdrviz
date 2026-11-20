import { describe, expect, it } from "vitest";
import type { Frequency } from "$lib/types/frequencies";
import { bodyFrom, changedFields, deleteCopy, deleteMatches, draftFrom, emptyDraft, identityOf, isDirty, newId, parseTarget, titleOf, validate, weekReadout } from "./editorForm";

const nec: Frequency = {
  id: "amtk-nec-road",
  label: "AMTK NEC",
  freq_mhz: 160.92,
  aar_channel: 54,
  railroad: "Amtrak",
  use: "road",
  line: "NEC",
  mode: "NFM",
  confidence: "high",
  notes: "",
  sources: ["https://a.example/x", "https://b.example/y"],
  assignments: [],
};

describe("dirty tracking", () => {
  it("is clean for a draft made from the frequency", () => {
    expect(isDirty(draftFrom(nec), draftFrom(nec))).toBe(false);
  });

  it("names the changed fields and ignores surrounding spaces", () => {
    const saved = draftFrom(nec);
    const draft = { ...saved, label: "AMTK NEC ", notes: "hello", use: "dispatch" };
    expect(changedFields(saved, draft)).toEqual(["use", "notes"]);
    expect(isDirty(saved, draft)).toBe(true);
  });

  it("is clean again when an edit is put back", () => {
    const saved = draftFrom(nec);
    expect(isDirty(saved, { ...saved, line: "x" })).toBe(true);
    expect(isDirty(saved, { ...saved, line: "NEC" })).toBe(false);
  });
});

describe("validate", () => {
  it("needs a label", () => {
    expect(validate(emptyDraft(" ")).label).toBe("Required");
    expect(validate(emptyDraft("5454"))).toEqual({});
  });

  it("wants a web address for the source", () => {
    expect(validate({ ...emptyDraft("x"), source: "nope" }).source).toBeTruthy();
    expect(validate({ ...emptyDraft("x"), source: "https://example.com/a" })).toEqual({});
  });
});

describe("bodyFrom", () => {
  it("keeps the identity and the other sources, replacing the first", () => {
    const draft = { ...draftFrom(nec), label: " NEW ", source: "https://c.example/z" };
    const body = bodyFrom(nec.id, nec.freq_mhz, draft, nec.sources);
    expect(body).toMatchObject({ id: "amtk-nec-road", label: "NEW", freq_mhz: 160.92 });
    expect(body.sources).toEqual(["https://c.example/z", "https://b.example/y"]);
  });

  it("drops the first source when it is cleared", () => {
    const body = bodyFrom(nec.id, nec.freq_mhz, { ...draftFrom(nec), source: "" }, nec.sources);
    expect(body.sources).toEqual(["https://b.example/y"]);
  });
});

describe("parseTarget", () => {
  it("reads a channel as 54, CH54 or the AAR pair 5454", () => {
    for (const text of ["54", "CH54", "ch54", " 5454 "]) expect(parseTarget(text)).toEqual({ ok: true, channel: 54, mhz: 160.92 });
  });

  it("reads MHz on a channel", () => {
    expect(parseTarget("160.920")).toEqual({ ok: true, channel: 54, mhz: 160.92 });
    expect(parseTarget("161.07 MHz")).toMatchObject({ ok: true, channel: 64 });
  });

  it("is silent about empty input", () => {
    expect(parseTarget("")).toEqual({ ok: false, message: "" });
  });

  it("refuses what is not an AAR channel", () => {
    for (const text of ["5455", "CH07x", "3", "98", "99", "160.921", "162.000", "159.9", "160.2", "abc", "540"]) {
      const result = parseTarget(text);
      expect(result.ok, text).toBe(false);
      expect((result as { message: string }).message, text).toMatch(/^NOT AN AAR CHANNEL/);
    }
  });

  it("accepts the ends of the band", () => {
    expect(parseTarget("07")).toMatchObject({ ok: true, mhz: 160.215 });
    expect(parseTarget("161.565")).toMatchObject({ ok: true, channel: 97 });
  });
});

describe("newId", () => {
  it("is the channel, then numbered when taken", () => {
    expect(newId(54, [])).toBe("ch54");
    expect(newId(7, ["ch07"])).toBe("ch07-2");
    expect(newId(54, ["ch54", "ch54-2"])).toBe("ch54-3");
  });
});

describe("delete", () => {
  it("matches only the exact label", () => {
    expect(deleteMatches("AMTK NEC", "AMTK NEC")).toBe(true);
    expect(deleteMatches(" AMTK NEC ", "AMTK NEC")).toBe(true);
    expect(deleteMatches("amtk nec", "AMTK NEC")).toBe(false);
    expect(deleteMatches("AMTK", "AMTK NEC")).toBe(false);
    expect(deleteMatches("", "")).toBe(false);
  });

  it("says recordings are kept, with the count only when known", () => {
    expect(deleteCopy(nec, 4812)).toBe("Removes 5454 AMTK NEC and its node assignments. Its 4 812 recordings and transcripts are kept.");
    expect(deleteCopy(nec, null)).toBe("Removes 5454 AMTK NEC and its node assignments. Its recordings and transcripts are kept.");
  });
});

describe("readouts", () => {
  it("titles and identifies a frequency", () => {
    expect(titleOf(nec)).toBe("5454 · AMTK NEC");
    expect(identityOf(nec)).toBe("160.920 MHz · CH54 · NFM");
  });

  it("totals the week, and says nothing when nothing was heard", () => {
    const days = [{ hours: [{ count: 400, airtime_s: 3000 }] }, { hours: [{ count: 12, airtime_s: 960 }] }];
    expect(weekReadout(days)).toBe("412 TX · 1H 06M AIR");
    expect(weekReadout([{ hours: [{ count: 0, airtime_s: 0 }] }])).toBeNull();
  });
});
