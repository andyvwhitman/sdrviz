import { describe, expect, it } from "vitest";
import { configFrom, draftFrom, emptyDraft, validateFeed } from "./feedForm";
import type { FeedConfig } from "./types";

const valid = () => ({ ...emptyDraft(), id: "feed-new", name: "NEW-05 Test", lat: "38.9", lon: "-77.0", host: "h.local" });

describe("validateFeed", () => {
  it("accepts a complete draft", () => expect(validateFeed(valid(), true, [])).toEqual({}));
  it("rejects a bad or taken id only for a new feed", () => {
    expect(validateFeed({ ...valid(), id: "Bad Id" }, true, []).id).toBeDefined();
    expect(validateFeed(valid(), true, ["feed-new"]).id).toBe("Already in use");
    expect(validateFeed({ ...valid(), id: "" }, false, []).id).toBeUndefined();
  });
  it("checks ranges and the host of a networked driver", () => {
    const errors = validateFeed({ ...valid(), lat: "95", host: "", gain_db: "x" }, true, []);
    expect(errors.lat).toBeDefined();
    expect(errors.host).toBe("Required");
    expect(errors.gain_db).toBe("A number");
  });
  it("a file driver needs no host or port", () => {
    expect(validateFeed({ ...valid(), driver: "file", host: "", port: "" }, true, [])).toEqual({});
    expect(configFrom({ ...valid(), driver: "file" })).toMatchObject({ host: "", port: null });
  });
});

describe("draftFrom", () => {
  it("falls back to the defaults for values the feed view reports as null", () => {
    const draft = draftFrom({ ...configFrom(valid()), gain_db: null, noise_floor_dbfs: null } as unknown as FeedConfig);
    expect(draft.gain_db).toBe("30");
    expect(draft.noise_floor_dbfs).toBe("-45");
  });
});
