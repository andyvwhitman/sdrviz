// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APPROACHING } from "./fixture";
import { SpotStore } from "./spot.svelte";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let calls: URL[];
let respond: (url: URL) => Response;

function geolocation(result: "ok" | "denied" | "unavailable") {
  const getCurrentPosition = vi.fn((success: PositionCallback, failure: PositionErrorCallback) => {
    if (result === "ok") success({ coords: { latitude: 39.0869, longitude: -76.7065, accuracy: 12 } } as GeolocationPosition);
    else failure({ code: result === "denied" ? 1 : 2, PERMISSION_DENIED: 1 } as GeolocationPositionError);
  });
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  return getCurrentPosition;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  calls = [];
  respond = (url) => (url.pathname.endsWith("/stops") ? json({ stops: [] }) : json(APPROACHING));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input, "http://localhost");
      calls.push(url);
      return respond(url);
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const approachingCalls = () => calls.filter((u) => u.pathname === "/api/transit/approaching");

describe("SpotStore", () => {
  it("asks the API for the spot and keeps the table", async () => {
    const store = new SpotStore();
    const stop = store.start();
    store.setSpot({ lat: 39.0869, lon: -76.7065, source: "typed" });
    await vi.advanceTimersByTimeAsync(0);
    const query = approachingCalls().at(-1)!.searchParams;
    expect(query.get("lat")).toBe("39.0869");
    expect(query.get("ahead_min")).toBe("60");
    expect(query.get("back_min")).toBe("10");
    expect(store.data?.trains).toHaveLength(APPROACHING.trains.length);
    stop();
  });

  it("polls every 15 seconds, keeps the last table when a poll fails, and stops when closed", async () => {
    const store = new SpotStore();
    const stop = store.start();
    store.setSpot({ lat: 39, lon: -76, source: "typed" });
    await vi.advanceTimersByTimeAsync(0);
    const before = approachingCalls().length;
    respond = () => json({ detail: "down" }, 503);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(approachingCalls().length).toBe(before + 1);
    expect(store.failed).toBe(true);
    expect(store.data).not.toBeNull();
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(approachingCalls().length).toBe(before + 1);
  });

  it("asks again with the new horizon", async () => {
    const store = new SpotStore();
    const stop = store.start();
    store.setSpot({ lat: 39, lon: -76, source: "typed" });
    store.setHorizon(120);
    await vi.advanceTimersByTimeAsync(0);
    expect(approachingCalls().at(-1)!.searchParams.get("ahead_min")).toBe("120");
    stop();
  });

  it("remembers the last spot and restores it on the next visit", async () => {
    const first = new SpotStore();
    const stopFirst = first.start();
    first.setSpot({ lat: 39.0869, lon: -76.7065, source: "station", name: "Odenton" });
    stopFirst();
    const second = new SpotStore();
    const stopSecond = second.start();
    expect(second.spot).toMatchObject({ name: "Odenton", lat: 39.0869 });
    expect(second.recent).toHaveLength(1);
    stopSecond();
  });

  it("works without storage", () => {
    const store = new SpotStore();
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    const stop = store.start();
    expect(() => store.setSpot({ lat: 39, lon: -76, source: "typed" })).not.toThrow();
    stop();
  });

  it("uses the device position when it is granted", async () => {
    geolocation("ok");
    const store = new SpotStore();
    const stop = store.start();
    store.useMyLocation();
    expect(store.locate).toBe("ok");
    expect(store.spot).toMatchObject({ source: "gps", accuracyM: 12, lat: 39.0869 });
    await vi.advanceTimersByTimeAsync(0);
    expect(approachingCalls().at(-1)!.searchParams.get("lon")).toBe("-76.7065");
    stop();
  });

  it("treats a denied or unavailable position as a state", () => {
    const store = new SpotStore();
    geolocation("denied");
    store.useMyLocation();
    expect(store.locate).toBe("denied");
    geolocation("unavailable");
    store.useMyLocation();
    expect(store.locate).toBe("unavailable");
    expect(store.spot).toBeNull();
  });

  it("ignores a position out of range", () => {
    const store = new SpotStore();
    store.setSpot({ lat: 95, lon: 0, source: "typed" });
    expect(store.spot).toBeNull();
  });
});
