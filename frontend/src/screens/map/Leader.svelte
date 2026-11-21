<svelte:options namespace="svg" />
<script lang="ts">
  /**
   * A real train's label on its leader: a 45 degree diagonal from the ring to an elbow, then a shelf the name sits on.
   * Inside the mark's hit group, so a click on the label or the shelf selects the train. When the quadrant changes the
   * old leader fades out and the new one draws outward from the mark (see .mp-leader in map.css).
   */
  import { fade } from "svelte/transition";
  import type { Pt } from "./lib/geom";
  import { leaderShape, type Quadrant } from "./lib/leaders";

  interface Props {
    pos: Pt;
    quadrant: Quadrant;
    text: string;
    labelWidth: number;
    scale: number;
    selected: boolean;
    stale: boolean;
    onselect: () => void;
  }
  let { pos, quadrant, text, labelWidth, scale, selected, stale, onselect }: Props = $props();

  const shape = $derived(leaderShape(quadrant, labelWidth, scale));
  const at = $derived(`translate(${pos[0].toFixed(1)} ${pos[1].toFixed(1)})`);
  const point = ([x, y]: Pt): string => `${x.toFixed(1)} ${y.toFixed(1)}`;
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // the old leader fades over t-flash (120 ms); reduced motion cuts
  const FADE_MS = reduced ? 0 : 120;
</script>

{#key quadrant}
  <g class="mp-hit mp-leader" class:is-selected={selected} class:is-stale={stale} transform={at} out:fade={{ duration: FADE_MS }}
    role="button" tabindex="-1" onclick={(e) => (e.stopPropagation(), onselect())} onkeydown={(e) => e.key === "Enter" && onselect()}>
    <path class="mp-leader-diag s-hair" pathLength="1" d="M{point(shape.from)}L{point(shape.elbow)}" />
    <g class="mp-leader-shelf">
      <path class="s-hair" d="M{point(shape.elbow)}L{point(shape.end)}" />
      <text class="mp-vlabel" x={shape.text[0].toFixed(1)} y={shape.text[1].toFixed(1)} text-anchor={shape.anchor}>{text}</text>
    </g>
  </g>
{/key}
