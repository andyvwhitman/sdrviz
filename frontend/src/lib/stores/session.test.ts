// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { session } from "./session.svelte";

const answer = (status: number, body: unknown = {}): void => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
};

afterEach(() => vi.unstubAllGlobals());

describe("session.check", () => {
  it("takes the role from the backend and treats a missing role as admin", async () => {
    answer(200, { authenticated: true, sim: false, role: "viewer" });
    await session.check();
    expect(session.role).toBe("viewer");
    expect(session.isAdmin).toBe(false);

    answer(200, { authenticated: true, sim: false });
    await session.check();
    expect(session.isAdmin).toBe(true);
  });

  it("a 401 is logged out; an outage is not", async () => {
    vi.useFakeTimers();
    answer(401, { detail: "Not authenticated" });
    await session.check();
    expect(session.authenticated).toBe(false);
    expect(session.unreachable).toBe(false);

    session.authenticated = null;
    answer(502);
    await session.check();
    expect(session.authenticated).toBeNull();
    expect(session.unreachable).toBe(true);
    vi.useRealTimers();
  });
});
