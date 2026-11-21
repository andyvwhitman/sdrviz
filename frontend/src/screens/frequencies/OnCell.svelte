<script lang="ts">
  /**
   * The ON cell (direction C.6): read-only. With every node together: a filled square and the number of nodes it is
   * enabled on, a hollow square and `0` when it is assigned but enabled nowhere, a dash when unassigned. With one node
   * chosen: `ON`, `OFF` or a dash. Editing happens in the drawer and on the frequency page.
   */
  import { enabledCount, slotOf } from "$lib/slots";
  import type { Frequency } from "$lib/types/frequencies";

  interface Props {
    f: Frequency;
    /** the node filter's feed id, or null for all nodes */
    node: string | null;
  }
  let { f, node }: Props = $props();

  const count = $derived(enabledCount(f));
  const slot = $derived(node ? slotOf(f, node) : f.assignments.length === 0 ? "none" : count > 0 ? "on" : "off");
  const text = $derived(node ? (slot === "on" ? "ON" : "OFF") : String(count));
  const label = $derived(
    slot === "none" ? "not assigned" : node ? (slot === "on" ? "enabled on this node" : "disabled on this node") : `enabled on ${count} ${count === 1 ? "node" : "nodes"}`,
  );
</script>

<span class="on" class:is-on={slot === "on"} role="img" aria-label={label} title={label}>
  {#if slot === "none"}
    —
  {:else}
    <i></i>{text}
  {/if}
</span>

<style>
  .on { display: inline-flex; align-items: center; gap: 6px; font: 400 var(--fs-12)/1 var(--font-data); color: var(--ink-3); white-space: nowrap; }
  .on.is-on { color: var(--ink); }
  .on i { width: 8px; height: 8px; flex: none; box-shadow: inset 0 0 0 1px var(--line-faint); }
  .on.is-on i { background: var(--state-idle); box-shadow: none; }
</style>
