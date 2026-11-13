<script lang="ts">
  /** Route tabs (counts per route) and the route overview with the stringline's viewport bracketed. */
  import Tabs from "$lib/components/Tabs.svelte";
  import Prims from "./Prims.svelte";
  import { buildOverview } from "./overview";
  import type { HistoryRow, Route } from "./types";

  interface Props {
    routes: Route[];
    route: Route;
    counts: Record<string, number>;
    rows: HistoryRow[];
    small: boolean;
    onselect: (id: string) => void;
  }
  let { routes, route, counts, rows, small, onselect }: Props = $props();

  // 1440 drops the operator prefix and the SUB suffix so the tabs fit
  const tabName = (r: Route) => (small ? r.name.replace(/^(CSX|NS) (· )?/, "").replace(/ SUB$/, "") : r.name);
  const items = $derived(routes.map((r) => ({ id: r.id, name: tabName(r), n: counts[r.id] ?? 0 })));

  let width = $state(0);
  const prims = $derived(width > 0 ? buildOverview(route, rows, width, small) : []);
</script>

<Tabs {items} selected={route.id} {onselect} />
<div class="hi-over" bind:clientWidth={width}>
  {#if width > 0}
    <svg class="hud" {width} height="32" viewBox="0 0 {width} 32" aria-label="Route overview"><Prims {prims} /></svg>
  {/if}
</div>
