import { describe, expect, it } from "vitest";
import { layoutFor, routeFor, type Route } from "./routes";

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
