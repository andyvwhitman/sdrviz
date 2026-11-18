<script lang="ts">
  /**
   * The approach ladder: minutes to the spot on a horizontal scale (M2 ruler), the spot as a registration mark (M4)
   * in the middle, trains converging from both sides. Basis is carried by outline, never hue: solid is tracked,
   * 4/4 dashed stale, 2/3 dashed predicted, a bare tick scheduled. The soonest pair of opposite trains that a
   * spotter can use gets an M12 dimension line with MEET in it.
   */
  import { hhmm } from "../map/lib/transitView";
  import { beyond, GUTTER_PX, ladderX, placeTags, pxPerMinute, tagText } from "./ladder";
  import { LADDER_MIN, meets, type Arm, type Row } from "./spot";

  interface Props {
    /** coming rows, sorted */
    rows: Row[];
    leftArm: Arm;
    rightArm: Arm;
    spotLabel: string;
    selected: string | null;
    onselect: (key: string | null) => void;
    onopen: (row: Row) => void;
  }
  let { rows, leftArm, rightArm, spotLabel, selected, onselect, onopen }: Props = $props();

  let width = $state(360);
  const wide = $derived(width >= 700);
  const GLYPH = $derived(wide ? { w: 16, h: 8, tail: 20 } : { w: 12, h: 6, tail: 12 });

  const live = $derived(rows.filter((r) => r.group === "coming"));
  const placed = $derived(placeTags(live, width));
  const counts = $derived(beyond(live));
  const perMin = $derived(pxPerMinute(width));
  const labelEvery = $derived(wide ? 5 : 10);
  const centre = $derived(width / 2);

  /* only the soonest meet is drawn */
  const meet = $derived.by(() => {
    const first = meets(live)[0];
    if (!first) return null;
    const a = ladderX(first.left, width);
    const b = ladderX(first.right, width);
    if (a === null || b === null) return null;
    const label = `MEET ~${hhmm(first.left.train.eta)}`;
    const half = label.length * 3.9;
    return { a, b, label, half, inline: Math.abs(b - a) > 2 * half + 16 };
  });

  /* the vertical plan, from the bottom: spot name, numerals, axis, meet line, glyphs, two tiers of tags, arm labels */
  const BASE_HEIGHT = $derived(wide ? 148 : 136);
  const height = $derived(BASE_HEIGHT + (meet && !meet.inline ? 16 : 0));
  const axisY = $derived(BASE_HEIGHT - 44);
  const glyphY = $derived(axisY - 28);
  const meetY = $derived(axisY - 18);
  const tagY = $derived([glyphY - 16, glyphY - 32] as const);

  const MAX_ARM = 13;
  const cut = (name: string): string => (name.length > MAX_ARM ? `${name.slice(0, MAX_ARM - 1)}\u2026` : name);
  /** desktop: `FROM WASHINGTON UNION · NB`; phone: just the name, cut short */
  const armText = (arm: Arm): string =>
    !arm.name ? "" : wide ? `FROM ${arm.name}${arm.tag ? ` \u00b7 ${arm.tag}` : ""}` : cut(arm.name);

  const ticks = $derived(Array.from({ length: LADDER_MIN * 2 + 1 }, (_, i) => i - LADDER_MIN));
  const xOfTick = (minute: number): number => centre + minute * perMin;
  const side = (row: Row): 1 | -1 => (row.side === "left" ? -1 : 1);
</script>

<div class="ld" bind:clientWidth={width}>
  <svg {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label="Trains converging on the spot, minutes to arrival">
    <!-- arm names -->
    {#if armText(leftArm)}<text class="ld__arm" x={GUTTER_PX - 12} y="14">{armText(leftArm)} ▶</text>{/if}
    {#if armText(rightArm)}<text class="ld__arm" x={width - GUTTER_PX + 12} y="14" text-anchor="end">◀ {armText(rightArm)}</text>{/if}
    <text class="ld__unit" x={centre} y="14" text-anchor="middle" display={wide ? undefined : "none"}>MINUTES TO SPOT</text>

    <!-- ruler -->
    <line class="ld__axis" x1={GUTTER_PX} x2={width - GUTTER_PX} y1={axisY} y2={axisY} />
    {#each ticks as minute (minute)}
      {@const major = minute % 5 === 0}
      <line class="ld__tick" class:is-major={major} x1={xOfTick(minute)} x2={xOfTick(minute)} y1={axisY} y2={axisY + (major ? 7 : 3)} />
      {#if minute % labelEvery === 0}
        <text class="ld__num" x={xOfTick(minute)} y={axisY + 22} text-anchor="middle">{Math.abs(minute)}</text>
      {/if}
    {/each}

    <!-- the beyond counts -->
    {#if counts.left}<text class="ld__beyond" x={GUTTER_PX - 14} y={glyphY + 4}>+{counts.left} ›</text>{/if}
    {#if counts.right}<text class="ld__beyond" x={width - GUTTER_PX + 14} y={glyphY + 4} text-anchor="end">‹ +{counts.right}</text>{/if}

    <!-- the meet: an M12 dimension line with the value in the line, or under the spot name when it will not fit -->
    {#if meet}
      {@const mid = (meet.a + meet.b) / 2}
      {@const [lo, hi] = meet.a < meet.b ? [meet.a, meet.b] : [meet.b, meet.a]}
      <path class="ld__dim" d="M{meet.a} {glyphY + GLYPH.h / 2}V{meetY}M{meet.b} {glyphY + GLYPH.h / 2}V{meetY}" />
      {#if meet.inline}
        <path class="ld__dim" d="M{lo} {meetY}H{mid - meet.half - 4}M{mid + meet.half + 4} {meetY}H{hi}" />
        <text class="ld__meet" x={mid} y={meetY + 4} text-anchor="middle">{meet.label}</text>
      {:else}
        <path class="ld__dim" d="M{lo} {meetY}H{hi}" />
        <text class="ld__meet" x={centre} y={axisY + 56} text-anchor="middle">{meet.label}</text>
      {/if}
    {/if}

    <!-- trains: every tail first, then every glyph, so no tail is drawn over another train -->
    {#each placed as p (p.row.train.key + ":tail")}
      {#if p.row.basis === "tracked"}
        <g class="ld__tails" style:transform="translate({p.x}px, {glyphY}px)">
          <line class="ld__tail" x1={side(p.row) * (GLYPH.w / 2)} x2={side(p.row) * (GLYPH.w / 2 + GLYPH.tail)} y1="0" y2="0" />
        </g>
      {/if}
    {/each}
    {#each placed as p (p.row.train.key)}
      {@const sel = selected === p.row.train.key}
      <g
        class="ld__train is-{p.row.basis}"
        class:is-sel={sel}
        style:transform="translate({p.x}px, {glyphY}px)"
        role="button"
        tabindex="-1"
        aria-label="{p.row.tag}, show details"
        onpointerenter={() => onselect(p.row.train.key)}
        onpointerleave={() => onselect(null)}
        onclick={() => onopen(p.row)}
        onkeydown={() => {}}
      >
        {#if p.row.basis === "scheduled"}
          <line class="ld__sched" x1="0" x2="0" y1={-GLYPH.h - 2} y2={GLYPH.h + 2} />
        {:else}
          <rect class="ld__glyph" x={-GLYPH.w / 2} y={-GLYPH.h / 2} width={GLYPH.w} height={GLYPH.h} />
        {/if}
        {#if sel}
          <path class="ld__bracket" d="M-{GLYPH.w / 2 + 3} -{GLYPH.h / 2 + 3}v-4h4M{GLYPH.w / 2 + 3} -{GLYPH.h / 2 + 3}v-4h-4M-{GLYPH.w / 2 + 3} {GLYPH.h / 2 + 3}v4h4M{GLYPH.w / 2 + 3} {GLYPH.h / 2 + 3}v4h-4" />
        {/if}
        {#if p.tier !== null}
          <text class="ld__tag" x="0" y={tagY[p.tier] - glyphY} text-anchor="middle">{tagText(p)}</text>
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
  .ld__meet { font: 400 13px var(--font-data); fill: var(--ink-2); }
  .ld__spot circle, .ld__spot path { stroke: var(--line); stroke-width: var(--sp-hair); fill: none; }

  .ld__train { cursor: pointer; transition: transform 400ms var(--ease-in-out); }
  .ld__glyph { stroke: var(--ink); stroke-width: var(--sp-hair); fill: var(--bg-void); }
  .is-tracked .ld__glyph { fill: var(--ink); }
  .is-stale .ld__glyph { stroke-dasharray: var(--sp-dash-stale); }
  .is-predicted .ld__glyph { stroke-dasharray: var(--sp-dash-predicted); }
  .ld__tails { transition: transform 400ms var(--ease-in-out); }
  .ld__tail { stroke: var(--ink-2); stroke-width: 1; }
  .ld__sched { stroke: var(--sp-faint); stroke-width: 1.5; }
  .ld__tag { font: 400 13px var(--font-data); fill: var(--ink); }
  .is-scheduled .ld__tag { fill: var(--ink-2); }
  .ld__bracket { stroke: var(--state-select); stroke-width: 1.5; fill: none; }
  .is-sel .ld__tag { fill: var(--state-select); }
  .ld__hit { fill: transparent; }
  @media (prefers-reduced-motion: reduce) { .ld__train, .ld__tails { transition: none; } }
</style>
