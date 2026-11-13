<script lang="ts">
  /**
   * A delay told by brightness only (decision 26): on time dim, later brighter, and from 5 minutes late a bar before
   * the number whose length grows with the lateness. `suspect` adds a "?" for a value the source cannot be believed on.
   */
  import type { DelayCell } from "./lib/transitView";

  interface Props extends DelayCell {
    suspect?: boolean;
  }
  let { text, tone, barPx, suspect = false }: Props = $props();
</script>

<span class="dl dl-{tone}">{#if barPx}<i class="dl__bar" style:width="{barPx}px"></i>{/if}{text}{#if suspect}<span class="dl__q" title="implausible, check source">?</span>{/if}</span>

<style>
  .dl { white-space: nowrap; }
  .dl-ok, .dl-unknown { color: var(--ink-3); }
  .dl-slight, .dl-early { color: var(--ink-2); }
  .dl-late { color: var(--ink); font-weight: 500; }
  .dl__bar { display: inline-block; height: 2px; margin-right: 5px; vertical-align: middle; background: currentColor; }
  .dl__q { margin-left: 4px; color: var(--ink-2); cursor: help; }
</style>
