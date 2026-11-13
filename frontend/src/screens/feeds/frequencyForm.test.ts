import { describe, expect, it } from "vitest";
import { aarOf, emptyFrequencyDraft, frequencyBody, validateFrequency } from "./frequencyForm";

const valid = () => ({ ...emptyFrequencyDraft(), id: "csx-test", label: "CSX TEST", freq_mhz: "160.230", railroad: "CSX", use: "road" });

describe("frequency form", () => {
  it("accepts a complete draft", () => expect(validateFrequency(valid(), true, [])).toEqual({}));
  it("rejects a frequency outside the AAR band and a taken id", () => {
    expect(validateFrequency({ ...valid(), freq_mhz: "460.1" }, true, []).freq_mhz).toBeDefined();
    expect(validateFrequency(valid(), true, ["csx-test"]).id).toBe("Already in use");
  });
  it("derives the AAR channel", () => expect(aarOf("160.230")).toBe(8));
  it("builds the request body", () => expect(frequencyBody({ ...valid(), source: "https://x.test" })).toMatchObject({ freq_mhz: 160.23, sources: ["https://x.test"] }));
});
