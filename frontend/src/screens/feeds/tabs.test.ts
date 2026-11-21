import { describe, expect, it } from "vitest";
import { tabAfterKey, tabFromQuery, tabQuery } from "./tabs";

describe("the Feeds tabs", () => {
  it("reads the tab from the URL, defaulting to SDR", () => {
    expect([tabFromQuery("transit"), tabFromQuery("sdr"), tabFromQuery(null), tabFromQuery("junk")]).toEqual(["transit", "sdr", "sdr", "sdr"]);
  });
  it("leaves the default tab out of the URL", () => {
    expect([tabQuery("sdr"), tabQuery("transit")]).toEqual([null, "transit"]);
  });
  it("moves with Left and Right and stops at the ends", () => {
    expect([tabAfterKey("sdr", "ArrowRight"), tabAfterKey("transit", "ArrowLeft"), tabAfterKey("transit", "ArrowRight"), tabAfterKey("sdr", "ArrowLeft"), tabAfterKey("sdr", "a")]).toEqual(["transit", "sdr", "transit", "sdr", null]);
  });
});
