import { nodesApi } from "$lib/api/nodes";
import type { SdrNode } from "$lib/types/nodes";

export const NODES_POLL_MS = 5_000;

/**
 * The node list for Settings, polled while a Nodes screen is open and not otherwise (reference counted, like the
 * transit store). A failed poll keeps the last list and sets `failed`; the next good poll clears it.
 */
class NodesStore {
  nodes = $state.raw<SdrNode[]>([]);
  /** at least one poll has answered, so an empty list means "no nodes" and not "not loaded yet" */
  loaded = $state(false);
  failed = $state(false);

  #users = 0;
  #timer: ReturnType<typeof setInterval> | undefined;

  /** Start polling; returns the stop function, for `onMount`. */
  start(): () => void {
    if (this.#users++ === 0) {
      void this.refresh();
      this.#timer = setInterval(() => void this.refresh(), NODES_POLL_MS);
    }
    return () => {
      if (--this.#users === 0) clearInterval(this.#timer);
    };
  }

  async refresh(): Promise<void> {
    try {
      this.nodes = await nodesApi.list();
      this.loaded = true;
      this.failed = false;
    } catch {
      this.failed = true;
    }
  }

  /** Replace one node in the list at once (after create, revoke, re-key or an edit) without waiting for the poll. */
  upsert(node: SdrNode): void {
    const known = this.nodes.some((n) => n.id === node.id);
    this.nodes = (known ? this.nodes.map((n) => (n.id === node.id ? node : n)) : [...this.nodes, node]).sort((a, b) => a.number - b.number);
  }
}

export const nodesStore = new NodesStore();
