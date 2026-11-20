<script lang="ts">
  /**
   * Node tabs (spec 5.24, direction 4.1) and, on the desktop, the density chip. One tab per node feed with its enabled
   * count; the selected one is `prefs.listen_feed`. Switching is an admin action (PATCH /api/prefs), a viewer's tabs
   * are not buttons. A node that is not ok shows its position light first and its name in ink-3.
   */
  import type { GlyphState } from "$lib/hud/tile";
  import Tabs from "$lib/components/Tabs.svelte";
  import { prefs } from "$lib/stores/prefs.svelte";
  import { session } from "$lib/stores/session.svelte";
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
  const listen = (id: string) => {
    if (id !== active) prefs.update({ listen_feed: id }).catch((error) => console.warn("node not switched", error));
  };
</script>

<div class="lo-tabs">
  <Tabs {items} selected={active ?? ""} onselect={session.isAdmin ? listen : undefined} />
  {#if density}
    <button class="chip lo-density" class:is-auto={density.auto} data-chip="nominal" type="button" title="Tile density: standard or compact" onclick={density.ontoggle}>
      DENSITY {density.shown.toUpperCase()}{density.auto ? " · AUTO" : ""}
    </button>
  {/if}
</div>
