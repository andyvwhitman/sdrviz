// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Feed, ListenableFeed } from "$lib/types/live";
import { router } from "$lib/router.svelte";
import NodePicker from "./NodePicker.svelte";

const choose = vi.fn();
vi.mock("$lib/stores/listen.svelte", () => ({ listen: { choose: (id: string) => choose(id) } }));

const node = (id: string, short: string): ListenableFeed => ({ feed_id: id, name: short, short, online: true });
const feed = (id: string, short: string, state: Feed["state"], hears = 8): Feed => ({ id, short, site: `${short} SITE`, state, hears: Array.from({ length: hears }, (_, i) => `f${i}`) }) as Feed;

const nodes = [node("a", "SDR-01"), node("b", "SDR-02"), node("c", "SDR-03")];
const feeds = [feed("a", "SDR-01", "ok"), feed("b", "SDR-02", "stale", 3), feed("c", "SDR-03", "offline", 0)];

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
let app: ReturnType<typeof mount> | undefined;
beforeEach(() => choose.mockClear());
afterEach(() => {
  if (app) unmount(app);
  app = undefined;
  document.body.innerHTML = "";
});

function setup(over: Record<string, unknown> = {}) {
  const target = document.createElement("div");
  document.body.append(target);
  app = mount(NodePicker, { target, props: { nodes, feeds, active: "a", keyedFeeds: new Set<string>(), ...over } });
  flushSync();
  const trigger = target.querySelector<HTMLButtonElement>("button[aria-haspopup=menu]")!;
  const items = () => [...document.querySelectorAll<HTMLElement>("[role^=menuitem]")];
  const key = (el: Element, name: string) => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
    flushSync();
  };
  return { trigger, items, key };
}

describe("the node picker", () => {
  it("is a menu button that starts closed and names the listened feed", () => {
    const { trigger, items } = setup();
    expect(trigger.textContent).toContain("FEED · SDR-01");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(items()).toHaveLength(0);
  });

  it("opens on a click with one radio item per node, the listened one checked, then the two links", async () => {
    const { trigger, items } = setup({ oninspect: () => {} });
    trigger.click();
    flushSync();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const all = items();
    expect(all.map((el) => el.getAttribute("role"))).toEqual(["menuitemradio", "menuitemradio", "menuitemradio", "menuitem", "menuitem"]);
    expect(all.slice(0, 3).map((el) => el.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    expect(all[0].textContent).toContain("8 ON");
    expect(all[1].textContent).toContain("STALE");
    expect(all[2].textContent).toContain("OFFLINE");
    expect(all[3].textContent).toContain("SDR-01 DETAILS");
    await settle();
    expect(document.activeElement).toBe(all[0]);
  });

  it("opens with ArrowDown on the trigger, focus on the checked item", async () => {
    const { trigger, items, key } = setup({ active: "b" });
    key(trigger, "ArrowDown");
    await settle();
    expect(document.activeElement).toBe(items()[1]);
  });

  it("wraps with Up and Down, jumps with Home and End, and closes with Escape back onto the trigger", async () => {
    const { trigger, items, key } = setup();
    trigger.click();
    flushSync();
    await settle();
    key(items()[0], "ArrowUp");
    expect(document.activeElement).toBe(items()[items().length - 1]);
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(items()[0]);
    key(document.activeElement!, "End");
    expect(document.activeElement).toBe(items()[items().length - 1]);
    key(document.activeElement!, "Home");
    expect(document.activeElement).toBe(items()[0]);
    key(document.activeElement!, "Escape");
    expect(items()).toHaveLength(0);
    expect(document.activeElement).toBe(trigger);
  });

  it("chooses a node through the listen store and closes", () => {
    const { trigger, items } = setup();
    trigger.click();
    flushSync();
    items()[1].click();
    flushSync();
    expect(choose).toHaveBeenCalledWith("b");
    expect(items()).toHaveLength(0);
  });

  it("closes on a click outside and on Tab", async () => {
    const { trigger, items, key } = setup();
    trigger.click();
    flushSync();
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    flushSync();
    expect(items()).toHaveLength(0);
    trigger.click();
    flushSync();
    await settle();
    key(document.activeElement!, "Tab");
    expect(items()).toHaveLength(0);
  });

  it("leaves DETAILS out when there is no inspector", () => {
    const { trigger, items } = setup();
    trigger.click();
    flushSync();
    expect(items().map((el) => el.textContent?.trim())).not.toContain("SDR-01 DETAILS");
  });

  it("on the phone, one DETAILS link opens the Feeds detail layer and ALL FEEDS is gone", () => {
    const go = vi.spyOn(router, "go").mockImplementation(() => {});
    const { trigger, items } = setup({ variant: "row" });
    trigger.click();
    flushSync();
    const links = items().filter((el) => el.getAttribute("role") === "menuitem");
    expect(links.map((el) => el.textContent?.trim())).toEqual(["SDR-01 DETAILS"]);
    links[0].click();
    expect(go).toHaveBeenCalledWith("/feeds?feed=a&open=1");
    go.mockRestore();
  });
});
