<script lang="ts">
  /**
   * Node tabs (spec 5.24, direction 4.1) and, on the desktop, the density chip. One tab per node feed with its enabled
   * count; the selected one is this browser's own choice (`listen` store), which any role may change. A node that is
   * not ok shows its position light first and its name in ink-3.
   */
  import type { GlyphState } from "$lib/hud/tile";
  import Tabs from "$lib/components/Tabs.svelte";
  import { listen } from "$lib/stores/listen.svelte";
  import type { Feed, ListenableFeed } from "$lib/types/live";

  interface Props {
    nodes: readonly ListenableFeed[];
    feeds: readonly Feed[];
    active: string | null;
    /** the tile density chip at the right of the tabs (desktop); omit on the phone */
    density?: { shown: "std" | "cmp"; auto: boolean; ontoggle: () => void };
  }
  let { nodes, feeds, active, density }: Props = $props();

  const GLYPH: Partial<Record<Feed["state"], GlyphState>> = { stale: "stale", offline: "offline", fault: "fault", disabled: "offline" };

  const items = $derived(
    nodes.map((node) => {
      const feed = feeds.find((f) => f.id === node.feed_id);
      const glyph = feed ? GLYPH[feed.state] : undefined;
      return { id: node.feed_id, name: node.short, n: feed?.hears.length, glyph, dim: feed?.state === "offline" || feed?.state === "disabled" };
    }),
  );
  const choose = (id: string) => {
    if (id !== active) listen.choose(id);
  };
</script>

<div class="lo-tabs">
  <Tabs {items} selected={active ?? ""} onselect={choose} />
  {#if density}
    <button class="chip lo-density" class:is-auto={density.auto} data-chip="nominal" type="button" title="Tile density: standard or compact" onclick={density.ontoggle}>
      DENSITY {density.shown.toUpperCase()}{density.auto ? " · AUTO" : ""}
    </button>
  {/if}
</div>
