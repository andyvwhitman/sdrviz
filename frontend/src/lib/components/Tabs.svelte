<script lang="ts">
  /** Chamfered tabs (spec 5.24): node and route selectors. */
  import PositionGlyph from "./PositionGlyph.svelte";
  import type { GlyphState } from "$lib/hud/tile";

  interface TabItem {
    id: string;
    name: string;
    /** count badge */
    n?: number | string;
    /** a position light before the name (a node that is not ok) */
    glyph?: GlyphState;
    /** the tab text goes to ink-3 (a disabled or offline node) */
    dim?: boolean;
  }
  interface Props {
    items: TabItem[];
    selected: string;
    onselect?: (id: string) => void;
  }
  let { items, selected, onselect }: Props = $props();
</script>

<div class="tabs" role="tablist">
  {#each items as item (item.id)}
    <button class="tab" class:is-dim={item.dim} role="tab" aria-selected={item.id === selected} onclick={() => onselect?.(item.id)}>
      {#if item.glyph}<PositionGlyph state={item.glyph} />{/if}{item.name}{#if item.n != null}<span class="n">{item.n}</span>{/if}
    </button>
  {/each}
</div>
