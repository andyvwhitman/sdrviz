<script lang="ts">
  /**
   * The approach ladder: minutes to the spot on a horizontal scale (M2 ruler), the spot as a registration mark (M4)
   * in the middle, trains converging from both sides. Basis is carried by outline, never hue: solid is tracked,
   * 4/4 dashed stale, 2/3 dashed predicted, a bare tick scheduled. Two opposite trains due close together get an
   * M12 dimension line labelled MEET.
   */
  import { hhmm } from "../map/lib/transitView";
  import { beyond, GUTTER_PX, ladderX, placeTags, pxPerMinute } from "./ladder";
  import { fromLabel, LADDER_MIN, meets, sideOf, type Row } from "./spot";

  interface Props {
    /** coming rows, sorted */
    rows: Row[];
    /** the track's bearing at the spot, which decides what each arm is called */
    bearing: number | null;
    spotLabel: string;
    selected: string | null;
    onselect: (key: string | null) => void;
    onopen: (row: Row) => void;
  }
  let { rows, bearing, spotLabel, selected, onselect, onopen }: Props = $props();

  let width = $state(360);
  const wide = $derived(width >= 700);
  const height = $derived(wide ? 148 : 136);
  /* the vertical plan, from the bottom: spot name, numerals, axis, meet line, glyphs, two tiers of tags, arm labels */
  const axisY = $derived(height - 44);
  const glyphY = $derived(axisY - 24);
  const tagY = $derived([glyphY - 16, glyphY - 32] as const);
  const centre = $derived(width / 2);

  const live = $derived(rows.filter((r) => r.group === "coming"));
  const placed = $derived(placeTags(live, width));
  const counts = $derived(beyond(live));
  const joined = $derived(meets(live));
  const perMin = $derived(pxPerMinute(width));
  const labelEvery = $derived(wide ? 5 : 10);

  /* the arm on the left is the one trains reach the spot from moving east (or north) */
  const leftFrom = $derived(bearing === null ? null : fromLabel(sideOf(bearing) === "left" ? bearing : bearing + 180));
  const rightFrom = $derived(bearing === null ? null : fromLabel(sideOf(bearing) === "left" ? bearing + 180 : bearing));

  const ticks = $derived(Array.from({ length: LADDER_MIN * 2 + 1 }, (_, i) => i - LADDER_MIN));
  const xOfTick = (minute: number): number => centre + minute * perMin;
  const GLYPH = { w: 20, h: 10, tail: 24 };
</script>

<div class="ld" bind:clientWidth={width}>
  <svg {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label="Trains converging on the spot, minutes to arrival">
    <!-- arm names -->
    {#if leftFrom}<text class="ld__arm" x={GUTTER_PX - 12} y="14">{leftFrom} ▶</text>{/if}
    {#if rightFrom}<text class="ld__arm" x={width - GUTTER_PX + 12} y="14" text-anchor="end">◀ {rightFrom}</text>{/if}

    <!-- ruler -->
    <line class="ld__axis" x1={GUTTER_PX} x2={width - GUTTER_PX} y1={axisY} y2={axisY} />
    {#each ticks as minute (minute)}
      {@const major = minute % 5 === 0}
      <line class="ld__tick" class:is-major={major} x1={xOfTick(minute)} x2={xOfTick(minute)} y1={axisY} y2={axisY + (major ? 7 : 3)} />
      {#if minute % labelEvery === 0}
        <text class="ld__num" x={xOfTick(minute)} y={axisY + 22} text-anchor="middle">{Math.abs(minute)}</text>
      {/if}
    {/each}
    <text class="ld__unit" x={centre} y="14" text-anchor="middle">MINUTES TO SPOT</text>

    <!-- the beyond counts -->
    {#if counts.left}<text class="ld__beyond" x={GUTTER_PX - 14} y={glyphY + 4}>+{counts.left} ›</text>{/if}
    {#if counts.right}<text class="ld__beyond" x={width - GUTTER_PX + 14} y={glyphY + 4} text-anchor="end">‹ +{counts.right}</text>{/if}

    <!-- meets: an M12 dimension line between the two glyphs -->
    {#each joined as meet (meet.left.train.key + meet.right.train.key)}
      {@const a = ladderX(meet.left, width)}
      {@const b = ladderX(meet.right, width)}
      {#if a !== null && b !== null}
        {@const mid = (a + b) / 2}
        {@const label = `MEET ~${hhmm(meet.left.train.eta)}`}
        <path class="ld__dim" d="M{a} {glyphY + 8}V{axisY - 4}M{b} {glyphY + 8}V{axisY - 4}M{a} {axisY - 10}H{b}" />
        <text class="ld__meet" x={mid} y={axisY - 6} text-anchor="middle" style:display={Math.abs(b - a) > label.length * 7 + 8 ? undefined : "none"}>{label}</text>
      {/if}
    {/each}

    <!-- trains -->
    {#each placed as p (p.row.train.key)}
      {@const away = p.row.side === "left" ? -1 : 1}
      {@const sel = selected === p.row.train.key}
      <g
        class="ld__train is-{p.row.basis}"
        class:is-sel={sel}
        style:transform="translate({p.x}px, {glyphY}px)"
        role="button"
        tabindex="-1"
        aria-label="{p.row.tag}, open trip"
        onpointerenter={() => onselect(p.row.train.key)}
        onpointerleave={() => onselect(null)}
        onclick={() => onopen(p.row)}
        onkeydown={() => {}}
      >
        {#if p.row.basis === "scheduled"}
          <line class="ld__sched" x1="0" x2="0" y1={-GLYPH.h} y2={GLYPH.h} />
        {:else}
          {#if p.row.basis === "tracked"}
            <line class="ld__tail" x1={away * (GLYPH.w / 2)} x2={away * (GLYPH.w / 2 + GLYPH.tail)} y1="0" y2="0" />
          {/if}
          <rect class="ld__glyph" x={-GLYPH.w / 2} y={-GLYPH.h / 2} width={GLYPH.w} height={GLYPH.h} />
        {/if}
        {#if sel}
          <path class="ld__bracket" d="M-15 -10v-5h5M15 -10v-5h-5M-15 10v5h5M15 10v5h-5" />
        {/if}
        {#if p.tier !== null}
          <text class="ld__tag" x="0" y={tagY[p.tier] - glyphY} text-anchor="middle">{p.row.tag}</text>
        {/if}
        <rect class="ld__hit" x="-16" y="-34" width="32" height="48" />
      </g>
    {/each}

    <!-- the spot: M4 registration mark -->
    <g class="ld__spot">
      <circle cx={centre} cy={axisY} r="6" />
      <path d="M{centre - 11} {axisY}H{centre + 11}M{centre} {axisY - 11}V{axisY + 11}" />
    </g>
    <text class="ld__where" x={centre} y={axisY + 40} text-anchor="middle">{spotLabel}</text>
  </svg>
</div>

<style>
  .ld { width: 100%; }
  svg { display: block; overflow: visible; font-family: var(--font-data); }
  .ld__arm { font: 500 var(--fs-11) var(--font-label); letter-spacing: var(--track-label); fill: var(--ink-2); text-transform: uppercase; }
  .ld__axis { stroke: var(--line); stroke-width: var(--sp-hair); }
  .ld__tick { stroke: var(--line-faint); stroke-width: 1; }
  .ld__tick.is-major { stroke: var(--line); }
  .ld__num { font: 400 13px var(--font-data); fill: var(--ink-2); }
  .ld__unit { font: 500 var(--fs-11) var(--font-label); letter-spacing: var(--track-label); fill: var(--ink-3); }
  .ld__where { font: 500 13px var(--font-label); fill: var(--ink); letter-spacing: var(--track-label); text-transform: uppercase; }
  .ld__beyond { font: 400 13px var(--font-data); fill: var(--ink-2); }
  .ld__dim { stroke: var(--ink-2); stroke-width: 1; fill: none; }
  .ld__meet { font: 400 13px var(--font-data); fill: var(--ink-2); paint-order: stroke; stroke: var(--bg-void); stroke-width: 4px; }
  .ld__spot circle, .ld__spot path { stroke: var(--line); stroke-width: var(--sp-hair); fill: none; }

  .ld__train { cursor: pointer; transition: transform 400ms var(--ease-in-out); }
  .ld__glyph { stroke: var(--ink); stroke-width: var(--sp-hair); fill: none; }
  .is-tracked .ld__glyph { fill: var(--ink); }
  .is-stale .ld__glyph { stroke-dasharray: var(--sp-dash-stale); }
  .is-predicted .ld__glyph { stroke-dasharray: var(--sp-dash-predicted); }
  .ld__tail { stroke: var(--ink-2); stroke-width: 1; }
  .ld__sched { stroke: var(--sp-faint); stroke-width: 1.5; }
  .ld__tag { font: 400 13px var(--font-data); fill: var(--ink); }
  .is-scheduled .ld__tag { fill: var(--ink-2); }
  .ld__bracket { stroke: var(--state-select); stroke-width: 1.5; fill: none; }
  .is-sel .ld__tag { fill: var(--state-select); }
  .ld__hit { fill: transparent; }
  @media (prefers-reduced-motion: reduce) { .ld__train { transition: none; } }
</style>
