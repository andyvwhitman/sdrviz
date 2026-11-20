// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import Divider from "./Divider.svelte";

let app: ReturnType<typeof mount> | undefined;
afterEach(() => {
  if (app) unmount(app);
  app = undefined;
  document.body.innerHTML = "";
});

function setup(over: Record<string, unknown> = {}) {
  const calls = { size: [] as number[], commit: 0, reset: 0 };
  const target = document.createElement("div");
  document.body.append(target);
  app = mount(Divider, {
    target,
    props: {
      orientation: "horizontal", size: 300, limits: { min: 168, max: 600 }, grows: 1, label: "Wall height", readout: "WALL 300", valuetext: "Wall 300 pixels",
      onsize: (px: number) => calls.size.push(px), oncommit: () => (calls.commit += 1), onreset: () => (calls.reset += 1), ...over,
    },
  });
  flushSync();
  return { calls, el: target.querySelector<HTMLElement>("[role=separator]")! };
}
const key = (el: HTMLElement, name: string, init: KeyboardEventInit = {}) => el.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init }));

describe("a divider", () => {
  it("is a focusable separator with the size and the limits as ARIA values", () => {
    const { el } = setup();
    expect(el.getAttribute("aria-orientation")).toBe("horizontal");
    expect(el.tabIndex).toBe(0);
    expect([el.getAttribute("aria-valuemin"), el.getAttribute("aria-valuemax"), el.getAttribute("aria-valuenow"), el.getAttribute("aria-valuetext")]).toEqual(["168", "600", "300", "Wall 300 pixels"]);
  });

  it("steps 8 px with an arrow, 64 with Shift, and jumps to the limits with Home and End", () => {
    const { calls, el } = setup();
    key(el, "ArrowDown");
    key(el, "ArrowUp", { shiftKey: true });
    key(el, "Home");
    key(el, "End");
    expect(calls.size).toEqual([308, 236, 168, 600]);
    expect(calls.commit).toBe(4);
  });

  it("never steps past a limit", () => {
    const { calls, el } = setup({ size: 595 });
    key(el, "ArrowDown", { shiftKey: true });
    expect(calls.size).toEqual([600]);
  });

  it("a column divider on the right grows its pane to the left", () => {
    const { calls, el } = setup({ orientation: "vertical", grows: -1, limits: { min: 360, max: 1000 }, size: 500 });
    key(el, "ArrowLeft");
    key(el, "ArrowRight");
    expect(calls.size).toEqual([508, 492]);
  });

  it("resets on Enter and on a double-click", () => {
    const { calls, el } = setup();
    key(el, "Enter");
    el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(calls.reset).toBe(2);
  });

  it("shows the readout plate for a key step", () => {
    vi.useFakeTimers();
    const { el } = setup();
    key(el, "ArrowDown");
    flushSync();
    expect(el.querySelector(".dv__plate")?.textContent).toBe("WALL 300");
    vi.advanceTimersByTime(1100);
    flushSync();
    expect(el.querySelector(".dv__plate")).toBeNull();
    vi.useRealTimers();
  });
});
