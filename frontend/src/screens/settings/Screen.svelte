<script lang="ts">
  /**
   * /settings: global settings. Left, the nodes. Right, the backend's own statistics. The transit sources
   * live on the Feeds page; the backend panel only reads them for its source table.
   */
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { nodesStore } from "$lib/stores/nodes.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import type { TransitSource } from "$lib/types/sources";
  import BackendPanel from "./BackendPanel.svelte";
  import NodesSection from "./NodesSection.svelte";
  import type { BackendStats, RadioStatus } from "./types";
  import "./settings.css";

  const POLL_MS = 5000;

  let sources = $state.raw<TransitSource[]>([]);
  let stats = $state.raw<BackendStats | null>(null);
  let statsFailed = $state(false);
  let radio = $state.raw<RadioStatus | null>(null);
  let now = $state(Date.now());

  async function load(): Promise<void> {
    const [backend, receiver, list] = await Promise.allSettled([api.backend(), api.radio.status(), api.transitSources.list()]);
    statsFailed = backend.status === "rejected";
    if (backend.status === "fulfilled") stats = backend.value;
    if (receiver.status === "fulfilled") radio = receiver.value as RadioStatus;
    if (list.status === "fulfilled") sources = list.value;
  }

  onMount(() => {
    load();
    const poll = setInterval(load, POLL_MS);
    const clock = setInterval(() => (now = Date.now()), 1000);
    return () => [poll, clock].forEach(clearInterval);
  });

  $effect(() => {
    const count = nodesStore.nodes.length;
    shell.statusFallback = `SETTINGS · ${count} ${count === 1 ? "NODE" : "NODES"} · CHANGES APPLY LIVE`;
  });
</script>

<div class="st">
  <section class="st-col st-col--nodes" aria-label="Nodes">
    <div class="st-list">
      <NodesSection />
    </div>
  </section>

  <section class="st-col st-col--backend">
    <BackendPanel {stats} {radio} {sources} {now} failed={statsFailed} />
  </section>
</div>
