import { describe, expect, it } from "vitest";
import { feedsColumns } from "./breakpoints";

describe("feedsColumns", () => {
  it("is three on the wide stage", () => {
    expect(feedsColumns(2138)).toBe(3);
    expect(feedsColumns(1920)).toBe(3);
  });
  it("is two below it", () => {
    expect(feedsColumns(1919)).toBe(2);
    expect(feedsColumns(1440)).toBe(2);
    expect(feedsColumns(1295)).toBe(2);
  });
});
