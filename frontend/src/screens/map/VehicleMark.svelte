<svelte:options namespace="svg" />
<script lang="ts">
  /**
   * A real train: the bar of the tracked-train mark inside a ring, with a chevron ahead of it, as prominent as a
   * feed site. The ring is solid for a measured position, dashed for one estimated from the schedule, and dim and
   * dashed once the position is stale. Selected, it takes the selection bracket.
   */
  import type { Pt } from "./lib/geom";
  import SelectBracket from "./SelectBracket.svelte";

  interface Props {
    pos: Pt;
    /** heading in degrees */
    angle: number;
    selected: boolean;
    estimated: boolean;
    stale: boolean;
    /** drawn smaller where trains crowd (the whole country in view) */
    scale?: number;
    onselect: () => void;
  }
  let { pos, angle, selected, estimated, stale, scale = 1, onselect }: Props = $props();

  const at = $derived(`translate(${pos[0].toFixed(1)} ${pos[1].toFixed(1)}) scale(${scale})`);
  const turn = $derived(`${at} rotate(${angle.toFixed(1)})`);
  const ring = $derived(stale ? "s-hair k-stale d-measure" : estimated ? "s-emph k-idle d-measure" : "s-emph k-idle");
</script>

<g class="mp-hit" role="button" tabindex="-1" onclick={(e) => (e.stopPropagation(), onselect())} onkeydown={(e) => e.key === "Enter" && onselect()}>
  <circle class="mp-stop-hit" transform={at} r="16" />
  <circle class="f-void {ring}" transform={at} r="10.5" />
  <path class="{stale ? 'k-stale' : 'k-idle'} s-emph" transform={turn} d="M14 0L19 -4M14 0L19 4" />
  <rect class={stale ? "f-line" : "f-ink"} transform={turn} x="-6" y="-2.5" width="12" height="5" />
  {#if selected}<SelectBracket x={pos[0]} y={pos[1]} o={17 * scale} a={12} />{/if}
</g>
