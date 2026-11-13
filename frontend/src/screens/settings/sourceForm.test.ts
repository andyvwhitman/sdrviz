import { describe, expect, it } from "vitest";
import { configFrom, draftFrom, emptyDraft, KEY_MASK, validateSource, withKind } from "./sourceForm";

const filled = () => ({ ...emptyDraft(), id: "marc", name: "MARC", agency: "MTA Maryland", static_url: "https://example.org/gtfs.zip" });

describe("sourceForm", () => {
  it("the kind decides the default numbers", () => {
    expect(withKind(emptyDraft(), "amtraker").rt_poll_s).toBe("60");
    expect(withKind(emptyDraft(), "lines").route_types).toBe("2");
  });

  it("validates ids, urls and numbers", () => {
    expect(validateSource(filled(), true, [])).toEqual({});
    expect(validateSource({ ...filled(), id: "Bad Id" }, true, []).id).toBeDefined();
    expect(validateSource(filled(), true, ["marc"]).id).toBe("Already in use");
    expect(validateSource({ ...filled(), static_url: "ftp://x" }, true, []).static_url).toBeDefined();
    expect(validateSource({ ...filled(), kind: "amtraker", static_url: "" }, true, [])).toEqual({});
    expect(validateSource({ ...filled(), rt_poll_s: "0" }, true, []).rt_poll_s).toBeDefined();
  });

  it("builds the request body, nulling what is empty", () => {
    const body = configFrom({ ...filled(), route_types: "2, 3" });
    expect(body).toMatchObject({ rt_alerts_url: null, api_key: null, route_types: [2, 3], static_refresh_h: 24, rt_poll_s: 15 });
  });

  it("keeps a stored key unless a new one is typed or it is cleared", () => {
    const stored = draftFrom({ ...configFrom(filled()), api_key: KEY_MASK });
    expect(configFrom(stored).api_key).toBe(KEY_MASK);
    expect(configFrom({ ...stored, api_key: "new" }).api_key).toBe("new");
    expect(configFrom({ ...stored, clear_key: true }).api_key).toBeNull();
  });
});
