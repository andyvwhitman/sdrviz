<script lang="ts">
  /** TODAY | YESTERDAY | 24 H rolling. The range lives in the URL (`?range=`). */
  import Tabs from "$lib/components/Tabs.svelte";
  import type { StatsRange } from "./types";

  interface Props {
    range: StatsRange;
    onselect: (range: StatsRange) => void;
  }
  let { range, onselect }: Props = $props();

  const ITEMS = [
    { id: "today", name: "TODAY" },
    { id: "yesterday", name: "YESTERDAY" },
    { id: "rolling_24h", name: "24 H" },
  ];
</script>

<Tabs items={ITEMS} selected={range} onselect={(id) => onselect(id as StatsRange)} />
