import { describe, expect, it } from "vitest";
import { place, type Box } from "./placement";

const area: Box = { left: 0, top: 44, right: 1280, bottom: 772 };
const size = { width: 480, height: 400 };
const box = (left: number, top: number, width = 200, height = 112): Box => ({ left, top, right: left + width, bottom: top + height });

describe("place", () => {
  it("opens 8 px right of a tile, top aligned", () => {
    expect(place("tile", box(100, 200), size, area)).toEqual({ left: 308, top: 200 });
  });

  it("flips to the left of a tile near the right edge", () => {
    expect(place("tile", box(1000, 200), size, area)).toEqual({ left: 1000 - 8 - 480, top: 200 });
  });

  it("clamps the top and the bottom inside the area with a 16 px margin", () => {
    expect(place("tile", box(100, 44), size, area).top).toBe(60);
    expect(place("tile", box(100, 700), size, area).top).toBe(772 - 16 - 400);
  });

  it("clamps to the left margin when neither side fits", () => {
    expect(place("tile", box(100, 200, 900), size, area).left).toBe(16);
  });

  it("right-aligns to a button and opens 8 px under it", () => {
    expect(place("button", box(1200, 100, 32, 32), size, area)).toEqual({ left: 752, top: 140 });
  });

  it("keeps a window taller than the area at the top margin", () => {
    expect(place("button", box(600, 100, 32, 32), { width: 480, height: 900 }, area).top).toBe(60);
  });
});
