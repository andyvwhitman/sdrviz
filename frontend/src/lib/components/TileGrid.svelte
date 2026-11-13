<script lang="ts">
  /** The tile grid: 5 x 4 standard, 3 x 5 compact (Live Ops). */
  import type { Snippet } from "svelte";

  interface Props {
    cols?: number;
    children: Snippet;
  }
  let { cols = 5, children }: Props = $props();
</script>

<div class="tile-grid" style:--tile-cols={cols}>{@render children()}</div>
