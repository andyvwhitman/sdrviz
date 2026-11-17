import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SdrNode } from "$lib/types/nodes";

vi.mock("$lib/api/nodes", () => ({ nodesApi: { list: vi.fn() } }));

import { nodesApi } from "$lib/api/nodes";
import { NODES_POLL_MS, nodesStore } from "./nodes.svelte";

const list = vi.mocked(nodesApi.list);
const node = (number: number): SdrNode => ({ id: `node-${number}`, number, name: `N${number}` }) as SdrNode;

beforeEach(() => {
  vi.useFakeTimers();
  list.mockReset();
  list.mockResolvedValue([node(1)]);
});
afterEach(() => vi.useRealTimers());

describe("nodesStore polling", () => {
  it("polls at once and then every 5 s while started", async () => {
    const stop = nodesStore.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(list).toHaveBeenCalledTimes(1);
    expect(nodesStore.nodes).toHaveLength(1);
    expect(nodesStore.loaded).toBe(true);
    await vi.advanceTimersByTimeAsync(NODES_POLL_MS * 2);
    expect(list).toHaveBeenCalledTimes(3);
    stop();
  });

  it("stops polling after the last user stops, and shares one timer between users", async () => {
    const stopA = nodesStore.start();
    const stopB = nodesStore.start();
    await vi.advanceTimersByTimeAsync(NODES_POLL_MS);
    expect(list).toHaveBeenCalledTimes(2); // one poll at start, one tick: not doubled
    stopA();
    await vi.advanceTimersByTimeAsync(NODES_POLL_MS);
    expect(list).toHaveBeenCalledTimes(3);
    stopB();
    await vi.advanceTimersByTimeAsync(NODES_POLL_MS * 3);
    expect(list).toHaveBeenCalledTimes(3);
  });

  it("keeps the last list when a poll fails and recovers on the next good one", async () => {
    await nodesStore.refresh();
    expect(nodesStore.failed).toBe(false);
    list.mockRejectedValueOnce(new Error("offline"));
    await nodesStore.refresh();
    expect(nodesStore.failed).toBe(true);
    expect(nodesStore.nodes).toHaveLength(1);
    list.mockResolvedValueOnce([node(1), node(2)]);
    await nodesStore.refresh();
    expect(nodesStore.failed).toBe(false);
    expect(nodesStore.nodes).toHaveLength(2);
  });

  it("upsert replaces a known node and adds a new one, ordered by number", () => {
    nodesStore.nodes = [node(1), node(3)];
    nodesStore.upsert({ ...node(3), name: "renamed" });
    nodesStore.upsert(node(2));
    expect(nodesStore.nodes.map((n) => `${n.number}:${n.name}`)).toEqual(["1:N1", "2:N2", "3:renamed"]);
  });

  it("keeps a history sample per poll and per node, with nulls while a node is not online", async () => {
    nodesStore.history = {};
    list.mockResolvedValueOnce([{ ...node(1), link_quality: 90, lag_ms: 200 } as SdrNode]);
    await nodesStore.refresh();
    list.mockResolvedValueOnce([{ ...node(1), link_quality: null, lag_ms: null } as SdrNode]);
    await nodesStore.refresh();
    expect(nodesStore.history["node-1"].map((s) => s.link)).toEqual([90, null]);
  });
});
