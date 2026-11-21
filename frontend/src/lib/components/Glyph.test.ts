import { describe, expect, it } from "vitest";
import { GLYPHS } from "./Glyph.svelte";

describe("glyphs", () => {
  it("draws each left-pointing glyph as its right-pointing twin mirrored", () => {
    expect(GLYPHS["chevron-left"].d).toBe(GLYPHS["chevron-right"].d);
    expect(GLYPHS["arrow-left"].d).toBe(GLYPHS["arrow-right"].d);
  });
});
