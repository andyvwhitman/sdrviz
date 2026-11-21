// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isPhoneFor, layoutFor, navFor, routeFor, type Route } from "./routes";

const route = (path: string): Route => routeFor(path)!;

describe("layoutFor", () => {
  it("keeps most routes on the stage in a wide window; Live Ops and Feeds are fluid and SPOT is a page", () => {
    expect(layoutFor(route("/live"), false)).toBe("fluid");
    expect(layoutFor(route("/feeds"), false)).toBe("fluid");
    expect(layoutFor(route("/map"), false)).toBe("stage");
    expect(layoutFor(route("/spot"), false)).toBe("page");
  });

  it("gives a phone a page for login, the map and SPOT", () => {
    for (const path of ["/login", "/map", "/spot"]) expect(layoutFor(route(path), true)).toBe("page");
  });

  it("gives a phone the wider-screen plate for Settings, and a page for Live Ops and Feeds", () => {
    expect(layoutFor(route("/settings"), true)).toBe("plate");
    expect(layoutFor(route("/feeds"), true)).toBe("page");
    expect(layoutFor(route("/live"), true)).toBe("page");
  });

  it("tests Live Ops and Feeds for a handset by width or height, and every other route by width", () => {
    const landscape = { phone: false, handset: true };
    expect(isPhoneFor(route("/live"), landscape)).toBe(true);
    expect(isPhoneFor(route("/feeds"), landscape)).toBe(true);
    expect(isPhoneFor(route("/map"), landscape)).toBe(false);
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

describe("docs route", () => {
  it("answers /docs and every page below it as a page-layout route, on a phone too", () => {
    for (const path of ["/docs", "/docs/readme", "/docs/live-websocket"]) {
      expect(routeFor(path)?.id).toBe("docs");
      expect(layoutFor(route(path), false)).toBe("page");
      expect(layoutFor(route(path), true)).toBe("page");
    }
    expect(routeFor("/documents")).toBeUndefined();
  });

  it("is open to viewers and not in the top menu or its hotkeys", () => {
    expect(route("/docs").adminOnly).toBeFalsy();
    expect(navFor(true).map((r) => r.id)).not.toContain("docs");
    expect(navFor(false).map((r) => r.id)).not.toContain("docs");
  });
});

describe("navFor", () => {
  it("shows an admin every tab and a viewer all but Settings", () => {
    expect(navFor(true).map((r) => r.id)).toContain("settings");
    expect(navFor(false).map((r) => r.id)).not.toContain("settings");
    expect(navFor(false).length).toBe(navFor(true).length - 1);
  });
});
