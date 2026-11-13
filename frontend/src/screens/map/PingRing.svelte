<svelte:options namespace="svg" />
<script lang="ts">
  /**
   * M14 ping ring: r 6 to 40, state-tx 60% to 0, 1200 ms, once per TX commit per receiving feed; the primary
   * feed's ring is 1.5 px. With `progress` set the ring is frozen at that point of the ease (motion study).
   */
  import { onMount } from "svelte";
  interface Props {
    x: number;
    y: number;
    primary?: boolean;
    /** 0..1: draw this frame instead of animating */
    progress?: number;
    ondone?: () => void;
  }
  let { x, y, primary = false, progress, ondone }: Props = $props();

  const T_PING_MS = 1200;
  onMount(() => {
    if (progress !== undefined) return;
    const timer = setTimeout(() => ondone?.(), T_PING_MS);
    return () => clearTimeout(timer);
  });
</script>

{#if progress === undefined}
  <circle class="ping is-firing" class:is-primary={primary} cx={x} cy={y} r="6" />
{:else}
  <circle class="ping" class:is-primary={primary} cx={x} cy={y} r={6 + 34 * progress} style="stroke-opacity: {(0.6 * (1 - progress)).toFixed(3)}" />
{/if}
