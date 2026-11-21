<script lang="ts">
  /**
   * The stage. `fit="window"` (login) scales the whole design to fill the window's height. `fit="box"` (Map,
   * Settings) scales only the content box it sits in, measured with a ResizeObserver, so the shell around it stays at
   * 1:1 CSS pixels. A window of exactly 1920 x 1080 renders 1:1 (what screenshots use).
   */
  import { onMount, type Snippet } from "svelte";
  import { stage } from "$lib/stores/stage.svelte";

  interface Props {
    fit?: "window" | "box";
    children: Snippet;
  }
  let { fit = "window", children }: Props = $props();

  let boxEl = $state<HTMLElement>();
  /** the box has been measured once, so the screen never lays out against a guess */
  const measured = $derived(fit === "window" || stage.box !== null);

  onMount(() => {
    if (fit !== "box" || !boxEl) return;
    const el = boxEl;
    const observer = new ResizeObserver(() => {
      stage.box = { width: el.clientWidth, height: el.clientHeight };
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      stage.box = null;
    };
  });

  const designW = $derived(stage.width);
  const designH = $derived(fit === "box" ? stage.contentHeight : stage.height);
</script>

{#if fit === "box"}
  <div class="stage-box" bind:this={boxEl}>
    {#if measured}
      <div class="stage-fit" style:width="{designW * stage.scale}px" style:height="{designH * stage.scale}px">
        <div class="hud-stage" style:--stage-w="{designW}px" style:--stage-h="{designH}px" style:transform={stage.scale === 1 ? undefined : `scale(${stage.scale})`} style:transform-origin="0 0">
          {@render children()}
        </div>
      </div>
    {/if}
  </div>
{:else}
  <div class="stage-viewport">
    <div class="stage-fit" style:width="{designW * stage.scale}px" style:height="{designH * stage.scale}px">
      <div class="hud-stage" style:--stage-w="{designW}px" style:transform={stage.scale === 1 ? undefined : `scale(${stage.scale})`} style:transform-origin="0 0">
        {@render children()}
      </div>
    </div>
  </div>
{/if}

<style>
  .stage-viewport {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: var(--bg-void);
    overflow: hidden;
  }
  .stage-box {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .stage-fit {
    position: relative;
    overflow: hidden;
  }
</style>
