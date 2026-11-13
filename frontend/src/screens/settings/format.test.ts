import { describe, expect, it } from "vitest";
import { bytes } from "./format";

describe("bytes", () => {
  it("scales to the largest unit", () => {
    expect(bytes(512)).toBe("512 B");
    expect(bytes(1536)).toBe("1.5 KB");
    expect(bytes(250 * 1024 ** 2)).toBe("250 MB");
    expect(bytes(null)).toBe("— — —");
  });
});
