<script lang="ts">
  /**
   * The stage: 1080 (or 900) design px tall, scaled to fill the window's height, and as wide as the window then
   * allows (lib/stores/stage). A window of exactly 1920 x 1080 renders 1:1 (what screenshots use).
   */
  import type { Snippet } from "svelte";
  import { stage } from "$lib/stores/stage.svelte";

  interface Props {
    children: Snippet;
  }
  let { children }: Props = $props();
</script>

<div class="stage-viewport">
  <div class="stage-fit" style:width="{stage.width * stage.scale}px" style:height="{stage.height * stage.scale}px">
    <div
      class="hud-stage"
      style:--stage-w="{stage.width}px"
      style:transform={stage.scale === 1 ? undefined : `scale(${stage.scale})`}
      style:transform-origin="0 0"
    >
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
