<svelte:options namespace="svg" />
<script lang="ts">
  /**
   * A tracked train: a 10 x 4 bar along its heading, a talking glow, the 600 m tail fading into past track (geo
   * only) and the selection bracket. Edge markers pin to the bezel as a triangle pointing off the view.
   */
  import { dPath } from "./lib/path";
  import type { Pt } from "./lib/geom";
  import SelectBracket from "./SelectBracket.svelte";

  interface Props {
    id: string;
    pos: Pt;
    /** heading in degrees */
    angle: number;
    talking: boolean;
    selected: boolean;
    /** the tail, in geo mode only */
    tail: Pt[] | null;
    /** pinned to the bezel and pointing off the view */
    edge: boolean;
    onselect: () => void;
  }
  let { id, pos, angle, talking, selected, tail, edge, onselect }: Props = $props();

  const slug = $derived(id.replace(/\W+/g, "-"));
  const transform = $derived(`translate(${pos[0].toFixed(1)} ${pos[1].toFixed(1)}) rotate(${angle.toFixed(1)})`);
  const tone = $derived(talking ? "var(--state-tx)" : "var(--ink)");
  const tailEnd = $derived(tail && tail.length > 1 ? tail[tail.length - 1] : null);
</script>

{#if tailEnd && tail}
  <linearGradient id="mp-tail-{slug}" gradientUnits="userSpaceOnUse" x1={pos[0].toFixed(1)} y1={pos[1].toFixed(1)} x2={tailEnd[0].toFixed(1)} y2={tailEnd[1].toFixed(1)}>
    <stop offset="0" stop-color={tone} stop-opacity="0.9" />
    <stop offset="1" stop-color={tone} stop-opacity="0" />
  </linearGradient>
  <path class="mp-tail" stroke="url(#mp-tail-{slug})" d={dPath(tail)} />
{/if}
<g class="mp-hit" role="button" tabindex="-1" onclick={onselect} onkeydown={(e) => e.key === "Enter" && onselect()}>
  {#if talking && !edge}
    <rect class="s-hair k-tx glow-2" {transform} x="-5" y="-2" width="10" height="4" />
    <rect class="s-hair k-tx glow-1" {transform} x="-5" y="-2" width="10" height="4" />
  {/if}
  {#if edge}
    <path class={talking ? "f-tx" : "mp-f-ink"} {transform} d="M6 0L-3 -5L-3 5Z" />
  {:else}
    <rect class={talking ? "f-tx" : "mp-f-ink"} {transform} x="-5" y="-2" width="10" height="4" />
  {/if}
  {#if selected}<SelectBracket x={pos[0]} y={pos[1]} />{/if}
</g>
