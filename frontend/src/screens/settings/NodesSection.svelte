<script lang="ts">
  /** Settings, Nodes: every node with its state, link quality and lag. Polls while it is on screen. */
  import { onMount } from "svelte";
  import Button from "$lib/components/Button.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { ApiError } from "$lib/api/client";
  import { nodesApi } from "$lib/api/nodes";
  import { nodesStore } from "$lib/stores/nodes.svelte";
  import type { NewNode, SdrNode } from "$lib/types/nodes";
  import AddNodeForm from "./AddNodeForm.svelte";
  import NodeCard from "./NodeCard.svelte";
  import NodeKeyModal from "./NodeKeyModal.svelte";

  let showRevoked = $state(false);
  let now = $state(Date.now());
  let adding = $state(false);
  let busy = $state(new Set<string>());
  let notice = $state("");
  /** The key to show, held only while its dialog is open: never in a store, the URL or storage. */
  let shownKey = $state<{ node: SdrNode; key: string; rekey: boolean } | null>(null);

  const message = (error: unknown): string => (error instanceof ApiError ? error.message : "Backend unreachable");

  async function create(node: NewNode): Promise<void> {
    const made = await nodesApi.create(node);
    nodesStore.upsert(made.node);
    adding = false;
    shownKey = { node: made.node, key: made.key, rekey: false };
  }

  /** Run one request on a node; a failure shows as a notice. */
  async function act(node: SdrNode, request: () => Promise<void>): Promise<void> {
    busy = new Set(busy).add(node.id);
    notice = "";
    try {
      await request();
    } catch (error) {
      notice = message(error);
    } finally {
      busy.delete(node.id);
      busy = new Set(busy);
    }
  }

  const rekey = (node: SdrNode) =>
    act(node, async () => {
      const made = await nodesApi.rekey(node.id);
      nodesStore.upsert(made.node);
      shownKey = { node: made.node, key: made.key, rekey: node.status !== "PENDING" };
    });

  const revoke = (node: SdrNode) => act(node, async () => nodesStore.upsert(await nodesApi.revoke(node.id)));

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
    <Button sm onclick={() => (adding = true)}>+ ADD NODE</Button>
  </header>
  {#if notice}<p class="st-card__error" role="alert">{notice}</p>{/if}
  {#if adding}<AddNodeForm onsave={create} oncancel={() => (adding = false)} />{/if}

  {#if nodesStore.failed && !nodesStore.loaded}
    <EmptyState title="NODES UNAVAILABLE" detail="The backend did not answer GET /api/nodes." />
  {:else if nodesStore.loaded && !shown.length && !adding}
    <EmptyState title="NO NODES" detail="No nodes. Add one to receive from outside the LAN." />
  {:else}
    {#each shown as node (node.id)}<NodeCard {node} {now} busy={busy.has(node.id)} onrekey={() => rekey(node)} onrevoke={() => revoke(node)} />{/each}
  {/if}
</section>

{#if shownKey}
  <NodeKeyModal nodeName={shownKey.node.name} keyText={shownKey.key} expiresAt={shownKey.node.key_expires_at} rekey={shownKey.rekey} onclose={() => (shownKey = null)} />
{/if}
