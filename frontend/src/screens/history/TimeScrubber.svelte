<script lang="ts">
  /** 24 h scrubber: airtime heat strip, range bracket, playhead, recording rail and the FEEDS lane. */
  import { rampColor } from "$lib/hud/ramp";
  import Prims from "./Prims.svelte";
  import { buildScrubber, STRIP_X } from "./scrubber";
  import type { ScrubberInput } from "./scrubber";

  interface Props {
    input: ScrubberInput;
  }
  let { input }: Props = $props();

  const scrubber = $derived(buildScrubber(input));
  let canvas = $state<HTMLCanvasElement>();

  // one pixel column per heat value, in the single-hue ramp
  $effect(() => {
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    scrubber.heat.forEach((t, c) => {
      context.fillStyle = rampColor(t);
      context.fillRect(c, 0, 1, canvas!.height);
    });
  });
</script>

<canvas bind:this={canvas} width={scrubber.heat.length} height="32" style:left="{STRIP_X}px" style:top="0"></canvas>
<svg class="hud" width={input.width} height="96" viewBox="0 0 {input.width} 96" aria-label="Time scrubber">
  <Prims prims={scrubber.prims} />
</svg>
