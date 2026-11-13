<svelte:options namespace="svg" />
<script lang="ts">
  /** The viewer's own position: a small ring with tick marks, inside a dashed circle for the fix accuracy. */
  interface Props {
    x: number;
    y: number;
    /** accuracy circle radius in canvas pixels, null when the fix is too vague to draw */
    accuracy: number | null;
  }
  let { x, y, accuracy }: Props = $props();
  const [r, tick] = [4, 10];
</script>

<g class="mp-user" aria-label="Your location">
  {#if accuracy !== null && accuracy > r + 2}
    <circle class="s-hair k-idle-dim" cx={x.toFixed(1)} cy={y.toFixed(1)} r={accuracy.toFixed(1)} stroke-dasharray="3 3" />
  {/if}
  <circle class="s-emph k-select" cx={x.toFixed(1)} cy={y.toFixed(1)} r={r} />
  <path class="s-hair k-select" d="M{x - tick} {y}h{tick - r - 2}M{x + r + 2} {y}h{tick - r - 2}M{x} {y - tick}v{tick - r - 2}M{x} {y + r + 2}v{tick - r - 2}" />
</g>
