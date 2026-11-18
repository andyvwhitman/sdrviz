// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { layoutFor, navFor, routeFor, type Route } from "./routes";

const route = (path: string): Route => routeFor(path)!;

describe("layoutFor", () => {
  it("keeps every route on the stage in a wide window, except the page routes", () => {
    expect(layoutFor(route("/live"), false)).toBe("stage");
    expect(layoutFor(route("/map"), false)).toBe("stage");
    expect(layoutFor(route("/spot"), false)).toBe("page");
  });

  it("gives a phone a page for login, the map and SPOT", () => {
    for (const path of ["/login", "/map", "/spot"]) expect(layoutFor(route(path), true)).toBe("page");
  });

  it("gives a phone the wider-screen plate for Live Ops, Feeds & Banks and Settings", () => {
    for (const path of ["/live", "/feeds", "/settings"]) expect(layoutFor(route(path), true)).toBe("plate");
  });
});

describe("routeFor", () => {
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
