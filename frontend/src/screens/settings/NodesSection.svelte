<script lang="ts">
  /** Settings, Nodes: every node with its state, link quality and lag. Polls while it is on screen. */
  import { onMount } from "svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { nodesStore } from "$lib/stores/nodes.svelte";
  import NodeCard from "./NodeCard.svelte";

  let showRevoked = $state(false);
  let now = $state(Date.now());

  const shown = $derived(nodesStore.nodes.filter((n) => showRevoked || n.status !== "REVOKED"));
  const revokedCount = $derived(nodesStore.nodes.filter((n) => n.status === "REVOKED").length);

  onMount(() => {
    const stop = nodesStore.start();
    const clock = setInterval(() => (now = Date.now()), 1000);
    return () => [stop, () => clearInterval(clock)].forEach((f) => f());
  });
</script>

<section class="nd" aria-label="Nodes">
  <header class="st-ph">
    <span class="t-panel">NODES</span>
    <span class="mono">{shown.length}</span>
    <span class="t-micro">REMOTE RECEIVERS</span>
    <span class="grow"></span>
    {#if revokedCount}<Toggle label="SHOW REVOKED · {revokedCount}" checked={showRevoked} onchange={(on) => (showRevoked = on)} />{/if}
  </header>

  {#if nodesStore.failed && !nodesStore.loaded}
    <EmptyState title="NODES UNAVAILABLE" detail="The backend did not answer GET /api/nodes." />
  {:else if nodesStore.loaded && !shown.length}
    <EmptyState title="NO NODES" detail="No nodes. Add one to receive from outside the LAN." />
  {:else}
    {#each shown as node (node.id)}<NodeCard {node} {now} />{/each}
  {/if}
</section>
