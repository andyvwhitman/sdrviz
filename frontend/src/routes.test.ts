// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isPhoneFor, layoutFor, navFor, routeFor, type Route } from "./routes";

const route = (path: string): Route => routeFor(path)!;

describe("layoutFor", () => {
  it("keeps most routes on the stage in a wide window; Live Ops is fluid and SPOT is a page", () => {
    expect(layoutFor(route("/live"), false)).toBe("fluid");
    expect(layoutFor(route("/feeds"), false)).toBe("stage");
    expect(layoutFor(route("/map"), false)).toBe("stage");
    expect(layoutFor(route("/spot"), false)).toBe("page");
  });

  it("gives a phone a page for login, the map and SPOT", () => {
    for (const path of ["/login", "/map", "/spot"]) expect(layoutFor(route(path), true)).toBe("page");
  });

  it("gives a phone the wider-screen plate for Feeds & Banks and Settings, and a page for Live Ops", () => {
    for (const path of ["/feeds", "/settings"]) expect(layoutFor(route(path), true)).toBe("plate");
    expect(layoutFor(route("/live"), true)).toBe("page");
  });

  it("tests Live Ops for a handset by width or height, and every other route by width", () => {
    const landscape = { phone: false, handset: true };
    expect(isPhoneFor(route("/live"), landscape)).toBe(true);
    expect(isPhoneFor(route("/feeds"), landscape)).toBe(false);
    expect(isPhoneFor(route("/live"), { phone: false, handset: false })).toBe(false);
  });
});

describe("routeFor", () => {
  it("keeps /frequencies apart from the /frequency prefix route", () => {
    expect(routeFor("/frequencies")?.id).toBe("frequencies");
    expect(routeFor("/frequency/x")?.id).toBe("frequency");
    expect(routeFor("/frequency")?.id).toBe("frequency");
    expect(layoutFor(route("/frequencies"), false)).toBe("fluid");
    expect(layoutFor(route("/frequencies"), true)).toBe("page");
  });

  it("answers a frequency id under /frequency, and nothing else below a path", () => {
    expect(routeFor("/frequency")?.id).toBe("frequency");
    expect(routeFor("/frequency/amtk-k-tower")?.id).toBe("frequency");
    expect(routeFor("/spot/anything")).toBeUndefined();
    expect(layoutFor(route("/frequency/amtk-k-tower"), true)).toBe("page");
  });
});

describe("navFor", () => {
  it("shows an admin every tab and a viewer all but Settings", () => {
    expect(navFor(true).map((r) => r.id)).toContain("settings");
    expect(navFor(false).map((r) => r.id)).not.toContain("settings");
    expect(navFor(false).length).toBe(navFor(true).length - 1);
  });
});
