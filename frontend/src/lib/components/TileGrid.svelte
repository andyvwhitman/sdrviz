<script lang="ts">
  /**
   * The tile grid. By default as many 200 px+ columns as fit, with the tiles stretching to fill the row (Live Ops);
   * `cols` fixes the column count at the tiles' own width (the kit).
   */
  import type { Snippet } from "svelte";

  interface Props {
    cols?: number;
    children: Snippet;
  }
  let { cols, children }: Props = $props();
</script>

<div class="tile-grid" class:tile-grid--fixed={cols !== undefined} style:--tile-cols={cols}>{@render children()}</div>
