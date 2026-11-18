// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SdrNode } from "$lib/types/nodes";

vi.mock("$lib/api/nodes", () => ({ nodesApi: { list: vi.fn(), create: vi.fn(), rekey: vi.fn(), revoke: vi.fn() } }));
vi.mock("$lib/api/client", () => ({ ApiError: class extends Error {}, api: { feeds: { list: vi.fn().mockResolvedValue([]) } } }));

import { nodesApi } from "$lib/api/nodes";
import { nodesStore } from "$lib/stores/nodes.svelte";
import NodesSection from "./NodesSection.svelte";

const KEY = "sdrviz-node1.SECRETKEYTEXT";
const node = (over: Partial<SdrNode> = {}): SdrNode =>
  ({ id: "node-aaaa1111", number: 1, feed_id: "node-1", name: "Roof", location: { lat: 38.9, lon: -77 }, preset: "aar", status: "ONLINE", link_quality: 90, lag_ms: 200, last_seen: null, agent_version: "0.1.0", health: null, key_expires_at: null, created_at: "2026-11-01T00:00:00Z", ...over }) as SdrNode;

let target: HTMLElement;
let app: ReturnType<typeof mount>;
const tick = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
  flushSync();
};
const button = (text: string): HTMLButtonElement => {
  const found = [...target.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`no button ${text}`);
  return found as HTMLButtonElement;
};
const click = async (text: string): Promise<void> => {
  button(text).click();
  await tick();
};

beforeEach(async () => {
  vi.useFakeTimers();
  vi.mocked(nodesApi.list).mockResolvedValue([node()]);
  nodesStore.nodes = [];
  target = document.body.appendChild(document.createElement("div"));
  app = mount(NodesSection, { target });
  await tick();
});
afterEach(() => {
  unmount(app);
  target.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("re-key", () => {
  it("asks first, calls the re-key endpoint, shows the key once and drops it on close", async () => {
    vi.mocked(nodesApi.rekey).mockResolvedValue({ node: node({ key_expires_at: new Date(Date.now() + 24 * 3_600_000).toISOString() }), key: KEY });
    await click("RE-KEY");
    expect(nodesApi.rekey).not.toHaveBeenCalled();
    await click("CONFIRM RE-KEY");
    expect(nodesApi.rekey).toHaveBeenCalledWith("node-aaaa1111");
    expect((target.ownerDocument.querySelector(".nk-key") as HTMLInputElement).value).toBe(KEY);
    expect(target.ownerDocument.body.textContent).toContain("THE OLD SECRET KEEPS WORKING");

    await click("DONE"); // neither copied nor saved: asks first
    expect(target.ownerDocument.querySelector(".nk-key")).not.toBeNull();
    await click("CLOSE, I DO NOT NEED IT");
    expect(target.ownerDocument.body.textContent).not.toContain(KEY);
    expect(target.ownerDocument.querySelector(".nk-key")).toBeNull();
  });

  it("closes without asking once the key was copied", async () => {
    vi.mocked(nodesApi.rekey).mockResolvedValue({ node: node(), key: KEY });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    await click("RE-KEY");
    await click("CONFIRM RE-KEY");
    await click("COPY");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(KEY);
    await click("DONE");
    expect(target.ownerDocument.querySelector(".nk-key")).toBeNull();
  });
});

describe("revoke", () => {
  it("asks with the node name, calls the revoke endpoint and moves the node to REVOKED", async () => {
    vi.mocked(nodesApi.revoke).mockResolvedValue(node({ status: "REVOKED" }));
    await click("REVOKE");
    expect(target.textContent).toContain("REVOKE Roof?");
    expect(nodesApi.revoke).not.toHaveBeenCalled();
    await click("CONFIRM REVOKE");
    expect(nodesApi.revoke).toHaveBeenCalledWith("node-aaaa1111");
    expect(nodesStore.nodes[0].status).toBe("REVOKED");
    expect(target.querySelector("article")).toBeNull(); // hidden behind SHOW REVOKED
  });
});

describe("add node", () => {
  it("creates the node and shows its key in the dialog", async () => {
    vi.mocked(nodesApi.create).mockResolvedValue({ node: node({ id: "node-new", number: 2, name: "Shed", status: "PENDING", key_expires_at: new Date(Date.now() + 24 * 3_600_000).toISOString() }), key: KEY });
    await click("+ ADD NODE");
    const set = (label: string, value: string): void => {
      const field = [...target.querySelectorAll("label.field")].find((l) => l.textContent?.includes(label))!.querySelector("input")!;
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set("NAME", "Shed");
    set("LATITUDE", "39.1");
    set("LONGITUDE", "-76.7");
    flushSync();
    await click("CREATE NODE");
    expect(nodesApi.create).toHaveBeenCalledWith({ name: "Shed", location: { lat: 39.1, lon: -76.7 }, preset: "banks" });
    expect((document.querySelector(".nk-key") as HTMLInputElement).value).toBe(KEY);
  });
});
