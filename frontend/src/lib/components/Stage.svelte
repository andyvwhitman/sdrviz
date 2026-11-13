<script lang="ts">
  /**
   * The stage: exactly 1920 x 1080 or 1440 x 900 (spec 4.1), scaled uniformly to fit the window and
   * letterboxed on bg-void. A window of exactly stage size renders 1:1 (what screenshots use).
   */
  import type { Snippet } from "svelte";
  import { params } from "$lib/params";

  interface Props {
    children: Snippet;
  }
  let { children }: Props = $props();

  const width = params.size;
  const height = params.size === 1440 ? 900 : 1080;

  let windowWidth = $state(innerWidth);
  let windowHeight = $state(innerHeight);
  const scale = $derived(Math.min(windowWidth / width, windowHeight / height));
</script>

<svelte:window bind:innerWidth={windowWidth} bind:innerHeight={windowHeight} />

<div class="stage-viewport">
  <div class="stage-fit" style:width="{width * scale}px" style:height="{height * scale}px">
    <div class="hud-stage" style:transform={scale === 1 ? undefined : `scale(${scale})`} style:transform-origin="0 0">
      {@render children()}
    </div>
  </div>
</div>

<style>
  .stage-viewport {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: var(--bg-void);
    overflow: hidden;
  }
  .stage-fit {
    position: relative;
    overflow: hidden;
  }
</style>
