<script lang="ts">
  /**
   * The frame both Feeds tabs share: a toolbar over a scrolling list on the left, the detail on the right, and the
   * divider between them. Under 1024 px wide one pane shows at a time: the list, then the detail as a full-screen
   * layer that the list stays mounted (and inert) beneath, so its scroll survives.
   */
  import type { Snippet } from "svelte";
  import Divider from "$lib/components/Divider.svelte";
  import Glyph from "$lib/components/Glyph.svelte";
  import { viewport } from "$lib/stores/viewport.svelte";
  import { feedsPrefs } from "./feedsPrefs.svelte";
  import { listBounds, listFraction, listSize, NARROW_PX } from "./split";

  interface Props {
    /** names the tab in the layer's back button, e.g. "SDR FEEDS" */
    title: string;
    /** the layer is open (only drawn when narrow) */
    layerOpen: boolean;
    /** nothing to show in the detail: the pane draws its own frame (content brings its own bracketed panel) */
    detailEmpty?: boolean;
    onback: () => void;
    toolbar?: Snippet;
    list: Snippet;
    detail: Snippet;
  }
  let { title, layerOpen, detailEmpty = false, onback, toolbar, list, detail }: Props = $props();

  const narrow = $derived(viewport.width < NARROW_PX);
  let width = $state(viewport.width);
  const size = $derived(listSize(width, feedsPrefs.split));
  const limits = $derived(listBounds(width));

  // while a layer covers the list the document does not scroll underneath, and the list keeps its place
  $effect(() => {
    const locked = narrow && layerOpen;
    document.documentElement.classList.toggle("fe-locked", locked);
    return () => document.documentElement.classList.remove("fe-locked");
  });

  function escape(event: KeyboardEvent): void {
    if (event.key === "Escape" && narrow && layerOpen && !event.defaultPrevented) {
      event.preventDefault();
      onback();
    }
  }
</script>

<svelte:window onkeydown={escape} />

<div class="fe-split" class:is-narrow={narrow} bind:clientWidth={width} style:--list-w="{size}px">
  <div class="fe-list" inert={narrow && layerOpen}>
    {#if toolbar}<div class="fe-toolbar">{@render toolbar()}</div>{/if}
    <div class="fe-list__scroll">{@render list()}</div>
  </div>

  {#if !narrow}
    <Divider
      class="fe-gutter"
      orientation="vertical"
      {size}
      {limits}
      grows={1}
      label="List width"
      readout="LIST {size}"
      valuetext="List {size} pixels"
      onsize={(px) => (feedsPrefs.split = listFraction(px, width))}
      oncommit={() => feedsPrefs.save()}
      onreset={() => ((feedsPrefs.split = null), feedsPrefs.save())}
    />
    <div class="fe-detail" class:br={detailEmpty}>
      <div class="fe-detail__scroll"><div class="fe-detail__in">{@render detail()}</div></div>
    </div>
  {:else if layerOpen}
    <div class="fe-layer">
      <header class="fe-layer__bar">
        <button type="button" class="fe-layer__back" onclick={onback}><Glyph name="chevron-left" size={16} />{title}</button>
      </header>
      <div class="fe-layer__body">{@render detail()}</div>
    </div>
  {/if}
</div>
