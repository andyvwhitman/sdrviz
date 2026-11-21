<script lang="ts">
  import Glyph from "$lib/components/Glyph.svelte";
  /**
   * The timeline: a tape of the next six hours (and the last one) that scrolls under a fixed window. Swipe it on a
   * phone, scroll or drag it on a desktop, or use the arrow keys; the table shows the trains inside the window.
   * Trains from the left run above the axis, trains from the right below it, each mark drawn by its basis (solid
   * tracked, dashed stale or predicted, a bare tick scheduled), never by hue. NOW is a dashed line on the tape.
   */
  import Chip from "$lib/components/Chip.svelte";
  import { meets, type Arm, type Row } from "./spot";
  import {
    HORIZONS,
    RANGE_AHEAD_MIN,
    RANGE_BACK_MIN,
    WINDOW_SHARE,
    clampOffset,
    clockAt,
    fittingTags,
    horizonText,
    inWindow,
    pxPerMinute,
    tickSteps,
    windowOf,
  } from "./timeline";

  interface Props {
    /** every train in the loaded range, any group */
    rows: Row[];
    /** minutes from now to the start of the window; 0 follows now */
    offsetMin: number;
    horizonMin: number;
    /** the moment the rows' `remainingS` count from (ms) */
    nowMs: number;
    leftArm: Arm;
    rightArm: Arm;
    onhorizon: (minutes: number) => void;
    onopen: (row: Row) => void;
  }
  let { rows, offsetMin = $bindable(), horizonMin, nowMs, leftArm, rightArm, onhorizon, onopen }: Props = $props();

  let width = $state(360);
  let scroller = $state<HTMLDivElement>();

  const perMin = $derived(pxPerMinute(width, horizonMin));
  const headX = $derived(Math.round(width * 0.12));
  const bandW = $derived(width * WINDOW_SHARE);
  const xOf = (minutes: number): number => headX + (minutes + RANGE_BACK_MIN) * perMin;
  const contentW = $derived(Math.ceil(xOf(RANGE_AHEAD_MIN) + (width - headX)));
  const steps = $derived(tickSteps(perMin));
  const win = $derived(windowOf(offsetMin, horizonMin));

  // the vertical plan: tags, upper marks, axis, lower marks, tags, clock labels
  const H = 104;
  const AXIS_Y = 46;
  const MARK_H = 12;
  const UPPER_Y = AXIS_Y - 10 - MARK_H;
  const LOWER_Y = AXIS_Y + 10;
  const TAG_GAP = 66;

  // ---- the tape follows the window, and the window follows the tape
  const scrollFor = (offset: number): number => (offset + RANGE_BACK_MIN) * perMin;
  $effect(() => {
    if (!scroller) return;
    const target = scrollFor(offsetMin);
    if (Math.abs(scroller.scrollLeft - target) > perMin * 0.75) scroller.scrollLeft = target;
  });
  function onscroll(): void {
    if (!scroller) return;
    const minutes = scroller.scrollLeft / perMin - RANGE_BACK_MIN;
    offsetMin = Math.abs(minutes) < 2 ? 0 : clampOffset(minutes, horizonMin); // NOW is a little sticky
  }
  // a mouse wheel scrolls the tape sideways (a trackpad already does)
  $effect(() => {
    const el = scroller;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  });
  function onkeydown(event: KeyboardEvent): void {
    const step = { ArrowRight: 5, ArrowLeft: -5, PageDown: 30, PageUp: -30 }[event.key];
    if (event.key === "Home") offsetMin = 0;
    else if (step) offsetMin = clampOffset(offsetMin + step, horizonMin);
    else return;
    event.preventDefault();
  }

  // ---- what is drawn
  const ticks = $derived.by(() => {
    const out: { m: number; label: boolean }[] = [];
    const first = Math.ceil(-RANGE_BACK_MIN / steps.minor) * steps.minor;
    // whole clock minutes: tick on :00, :05 ... local time, not on minutes-from-now
    const shift = ((new Date(nowMs).getMinutes() % steps.minor) + new Date(nowMs).getSeconds() / 60) % steps.minor;
    for (let m = first - shift; m <= RANGE_AHEAD_MIN; m += steps.minor) {
      const clockMin = Math.round(new Date(nowMs + m * 60_000).getMinutes());
      out.push({ m, label: clockMin % steps.label === 0 });
    }
    return out;
  });

  interface Mark {
    row: Row;
    x: number;
    upper: boolean;
    inside: boolean;
  }
  const marks = $derived<Mark[]>(
    rows
      .map((row) => ({ row, x: xOf(row.remainingS / 60), upper: row.side === "left", inside: inWindow(row, win) }))
      .filter((m) => m.x >= 0 && m.x <= contentW)
      .sort((a, b) => a.x - b.x),
  );
  const tagged = $derived.by(() => {
    const keys = new Set<string>();
    for (const upper of [true, false]) {
      // tags only inside the band: the edge to its left holds the lane labels
      const lane = marks.filter((m) => m.upper === upper && m.inside && m.x >= xOf(offsetMin) + 8);
      for (const i of fittingTags(lane.map((m) => m.x), TAG_GAP)) keys.add(lane[i].row.train.key);
    }
    return keys;
  });
  const meet = $derived.by(() => {
    const first = meets(rows.filter((r) => inWindow(r, win) && r.group === "coming"))[0];
    return first ? { a: xOf(first.left.remainingS / 60), b: xOf(first.right.remainingS / 60) } : null;
  });

  const fromClock = $derived(clockAt(nowMs, offsetMin));
  const toClock = $derived(clockAt(nowMs, offsetMin + horizonMin));
  const valueText = $derived(win.live ? `Now to ${toClock}` : `${fromClock} to ${toClock}`);
</script>

<section class="tl">
  <div class="tl__head">
    <div class="tl__when" aria-live="polite">
      {#if win.live}
        <span class="tl__now-k">NOW</span><span class="tl__to"><Glyph name="arrow-right" /> {toClock}</span>
      {:else}
        <span class="tl__from">{fromClock}</span><span class="tl__to"><Glyph name="arrow-right" /> {toClock}</span>
      {/if}
    </div>
    {#if !win.live}
      <button class="tl__back" type="button" onclick={() => (offsetMin = 0)}>NOW</button>
    {/if}
    <div class="tl__horizons" role="group" aria-label="Window length">
      {#each HORIZONS as minutes (minutes)}
        <Chip button kind="filter" text={horizonText(minutes)} pressed={horizonMin === minutes} onclick={() => onhorizon(minutes)} />
      {/each}
    </div>
  </div>

  <div class="tl__strip" bind:clientWidth={width}>
    <div
      class="tl__scroll"
      bind:this={scroller}
      {onscroll}
      {onkeydown}
      role="slider"
      tabindex="0"
      aria-label="Time window, scroll to move"
      aria-valuemin={-RANGE_BACK_MIN}
      aria-valuemax={RANGE_AHEAD_MIN - horizonMin}
      aria-valuenow={offsetMin}
      aria-valuetext={valueText}
    >
      <svg width={contentW} height={H} viewBox="0 0 {contentW} {H}" aria-hidden="true">
        <line class="tl__axis" x1="0" x2={contentW} y1={AXIS_Y} y2={AXIS_Y} />
        {#each ticks as tick (tick.m)}
          {@const x = xOf(tick.m)}
          <line class="tl__tick" class:is-major={tick.label} x1={x} x2={x} y1={AXIS_Y - (tick.label ? 5 : 2)} y2={AXIS_Y + (tick.label ? 5 : 2)} />
          {#if tick.label}<text class="tl__clock" x={x} y={H - 6} text-anchor="middle">{clockAt(nowMs, tick.m)}</text>{/if}
        {/each}

        <line class="tl__nowline" x1={xOf(0)} x2={xOf(0)} y1="2" y2={H - 20} />

        {#if meet}
          <path class="tl__meet" d="M{meet.a} {UPPER_Y + MARK_H}L{meet.b} {LOWER_Y}" />
        {/if}

        {#each marks as m (m.row.train.key)}
          {@const y = m.upper ? UPPER_Y : LOWER_Y}
          <g
            class="tl__train is-{m.row.basis}"
            class:is-out={!m.inside}
            class:is-passed={m.row.group === "passed"}
            role="button"
            tabindex="-1"
            aria-label={m.row.tag}
            onclick={() => onopen(m.row)}
            onkeydown={() => {}}
          >
            {#if m.row.basis === "scheduled"}
              <line class="tl__sched" x1={m.x} x2={m.x} y1={y} y2={y + MARK_H} />
            {:else}
              <rect class="tl__mark" x={m.x - 2.5} y={y} width="5" height={MARK_H} />
            {/if}
            {#if tagged.has(m.row.train.key)}
              <text class="tl__tag" x={m.x} y={m.upper ? y - 6 : y + MARK_H + 14} text-anchor="middle">{m.row.tag}</text>
            {/if}
            <rect class="tl__hit" x={m.x - 12} y={y - 18} width="24" height={MARK_H + 36} />
          </g>
        {/each}
      </svg>
    </div>

    <!-- fixed over the tape: the window, and which way each lane runs -->
    <div class="tl__band" style:left="{headX}px" style:width="{bandW}px" aria-hidden="true"></div>
    <div class="tl__lane tl__lane--up" aria-hidden="true">{#if leftArm.tag}{leftArm.tag}{/if}<Glyph name="arrow-right" size={14} /></div>
    <div class="tl__lane tl__lane--down" aria-hidden="true"><Glyph name="arrow-left" size={14} />{#if rightArm.tag}{rightArm.tag}{/if}</div>
  </div>
</section>

<style>
  .tl { border-top: 1px solid var(--grid); }
  .tl__head { display: flex; align-items: center; gap: 8px; padding: 8px 16px 4px; min-width: 0; }
  .tl__when { display: flex; align-items: baseline; gap: 8px; flex: 1; min-width: 0; white-space: nowrap; }
  .tl__now-k, .tl__from { font: 400 var(--fs-15)/1 var(--font-data); color: var(--ink); }
  .tl__now-k { font-family: var(--font-label); font-weight: 500; letter-spacing: var(--track-label); }
  .tl__to { font: 400 var(--fs-13)/1 var(--font-data); color: var(--ink-2); }
  .tl__back {
    height: 28px; padding: 0 10px; border: 0; background: none; cursor: pointer; color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--line); font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label);
  }
  .tl__horizons { display: flex; gap: 4px; }
  .tl__horizons :global(.chip) { height: 28px; padding: 0 8px; }

  .tl__strip { position: relative; }
  .tl__scroll {
    overflow-x: auto; overflow-y: hidden; scrollbar-width: none; overscroll-behavior-x: contain;
    cursor: grab; outline: none;
  }
  .tl__scroll::-webkit-scrollbar { display: none; }
  .tl__scroll:focus-visible { box-shadow: inset 0 0 0 1px var(--state-select); }
  svg { display: block; font-family: var(--font-data); }

  .tl__axis { stroke: var(--line); stroke-width: var(--sp-hair); }
  .tl__tick { stroke: var(--line-faint); stroke-width: 1; }
  .tl__tick.is-major { stroke: var(--line); }
  .tl__clock { font: 400 var(--fs-13) var(--font-data); fill: var(--ink-3); }
  .tl__nowline { stroke: var(--ink-2); stroke-width: 1; stroke-dasharray: 2 3; }
  .tl__meet { stroke: var(--ink-3); stroke-width: 1; stroke-dasharray: 1 2; }

  .tl__train { cursor: pointer; }
  .tl__mark { stroke: var(--ink); stroke-width: var(--sp-hair); fill: var(--bg-void); }
  .is-tracked .tl__mark { fill: var(--ink); }
  .is-stale .tl__mark { stroke-dasharray: var(--sp-dash-stale); }
  .is-predicted .tl__mark { stroke-dasharray: var(--sp-dash-predicted); }
  .tl__sched { stroke: var(--ink-2); stroke-width: 1.5; }
  .tl__tag { font: 400 12px var(--font-data); fill: var(--ink); }
  .is-scheduled .tl__tag { fill: var(--ink-2); }
  .tl__train.is-out { opacity: 0.35; }
  .tl__train.is-passed:not(.is-out) { opacity: 0.6; }
  .tl__hit { fill: transparent; }

  .tl__band {
    position: absolute; top: 0; bottom: 18px; pointer-events: none;
    background: color-mix(in srgb, var(--ink) 5%, transparent);
    box-shadow: inset 1px 0 0 var(--ink-2), inset -1px 0 0 var(--line-faint);
  }
  .tl__lane {
    position: absolute; left: 8px; pointer-events: none; display: flex; align-items: center; gap: 4px; font: 500 var(--fs-11)/1 var(--font-label);
    letter-spacing: var(--track-label); color: var(--ink-3); background: var(--bg-void); padding: 1px 2px;
  }
  .tl__lane--up { top: 24px; }
  .tl__lane--down { top: 56px; }

  @media (min-width: 900px) {
    .tl__head { padding: 10px var(--margin-x) 4px; }
  }
</style>
