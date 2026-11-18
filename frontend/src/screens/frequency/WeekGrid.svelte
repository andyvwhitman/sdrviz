<script lang="ts">
  /**
   * The week grid (M27): 7 days by 24 hours, today on top, one cell per hour. Brightness is the airtime in the hour,
   * in four fixed steps, printed as a key. A click or Enter on a cell shows that day and jumps the log to that hour.
   */
  import * as fmt from "$lib/hud/fmt";
  import { viewport } from "$lib/stores/viewport.svelte";
  import type { WeekActivity } from "$lib/types/recordings";
  import { clockOf, dayName } from "./frequency";
  import { cellKind, hourEnds, rampStep } from "./weekGrid";
  import RangeSwitch from "./RangeSwitch.svelte";

  interface Props {
    week: WeekActivity | null;
    tz: string;
    nowMs: number;
    /** the day the strip shows (YYYY-MM-DD), bracketed */
    shownDate: string;
    /** the phone's range switch, drawn in the read row */
    range?: "day" | "week";
    dayLabel?: string;
    onrange?: (range: "day" | "week") => void;
    /** a cell was chosen: its day, and the hour index (null for a click on the day label) */
    onpick: (date: string, hour: number | null) => void;
  }
  let { week, tz, nowMs, shownDate, range, dayLabel = "TODAY", onrange, onpick }: Props = $props();

  const phone = $derived(viewport.phone);
  const CELL = $derived(phone ? 12 : 14);
  const PITCH = $derived(phone ? 13 : 16);
  const LABEL_W = 40;
  const TOTAL_W = $derived(phone ? 0 : 48);
  const HEAD = 18;

  let hover = $state<{ row: number; col: number } | null>(null);
  let cursor = $state<{ row: number; col: number } | null>(null);

  /** newest first: today on top */
  const days = $derived([...(week?.days ?? [])].reverse());
  const sinceMs = $derived(week?.recording_since ? Date.parse(week.recording_since) : null);
  const ends = $derived(days.map((day, i) => hourEnds(day.hours, i > 0 ? days[i - 1].hours[0]?.start : undefined)));
  const airtime = (row: number): number => days[row].hours.reduce((sum, h) => sum + h.airtime_s, 0);
  const weekAir = $derived(days.reduce((sum, day) => sum + day.hours.reduce((s, h) => s + h.airtime_s, 0), 0));
  const COLS = 24;
  const gridW = $derived(COLS * PITCH);
  const height = $derived(HEAD + Math.max(days.length, 7) * PITCH + 2);
  const focus = $derived(hover ?? cursor);

  const reading = $derived.by(() => {
    if (!week) return fmt.BLANK;
    if (focus && days[focus.row]?.hours[focus.col]) {
      const hour = days[focus.row].hours[focus.col];
      const end = ends[focus.row][focus.col];
      const span = `${clockOf(hour.start, tz).slice(0, 5)}–${clockOf(end, tz).slice(0, 5)}`;
      const kind = cellKind(hour, end, sinceMs, nowMs);
      return `${dayName(days[focus.row].date)} · ${span} · ${kind === "none" ? "NOT RECORDED" : `${hour.count} TX · ${fmt.total(hour.airtime_s)} AIR`}`;
    }
    if (sinceMs === null) return "NOT RECORDED";
    return `${fmt.total(weekAir)} AIR`;
  });

  function cellAt(event: PointerEvent | MouseEvent, svg: SVGSVGElement): { row: number; col: number } | null {
    const box = svg.getBoundingClientRect();
    const col = Math.floor((event.clientX - box.left - LABEL_W) / PITCH);
    const row = Math.floor((event.clientY - box.top - HEAD) / PITCH);
    return col >= 0 && col < COLS && row >= 0 && row < days.length ? { row, col } : null;
  }

  function keydown(event: KeyboardEvent): void {
    const move: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (move[event.key]) {
      event.preventDefault();
      event.stopPropagation();
      const at = cursor ?? { row: 0, col: 0 };
      cursor = { row: Math.min(days.length - 1, Math.max(0, at.row + move[event.key][0])), col: Math.min(COLS - 1, Math.max(0, at.col + move[event.key][1])) };
    } else if (event.key === "Enter" && cursor) {
      event.preventDefault();
      event.stopPropagation();
      onpick(days[cursor.row].date, cursor.col);
    }
  }

  const KEY = [
    { step: 2, label: ">0" },
    { step: 3, label: "1M" },
    { step: 4, label: "3M" },
    { step: 5, label: "10M+" },
  ];
</script>

<section class="wk" aria-label="Last 7 days">
  <div class="wk__read">
    {#if range && onrange}<RangeSwitch {range} {dayLabel} {onrange} />{:else}<span class="wk__title">LAST 7 DAYS</span>{/if}
    <span class="wk__totals" aria-live="off">{reading}</span>
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <svg
    class="wk__svg"
    width={LABEL_W + gridW + TOTAL_W}
    {height}
    role="group"
    tabindex="0"
    aria-label="Hours of airtime, last 7 days"
    onpointermove={(e) => (hover = cellAt(e, e.currentTarget as SVGSVGElement))}
    onpointerleave={() => (hover = null)}
    onclick={(e) => {
      const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const row = Math.floor((e.clientY - box.top - HEAD) / PITCH);
      const col = Math.floor((e.clientX - box.left - LABEL_W) / PITCH);
      if (row < 0 || row >= days.length) return;
      if (col >= 0 && col < COLS) onpick(days[row].date, col);
      else if (col < 0) onpick(days[row].date, null);
    }}
    onkeydown={keydown}
    onblur={() => (cursor = null)}
  >
    {#each [0, 6, 12, 18, 23] as h (h)}
      <text class="wk__n" x={LABEL_W + h * PITCH + CELL / 2} y={HEAD - 6} text-anchor="middle">{String(h).padStart(2, "0")}</text>
    {/each}

    {#each days as day, row (day.date)}
      {@const y = HEAD + row * PITCH}
      {@const shown = day.date === shownDate}
      <text class="wk__d" class:is-today={row === 0} x="0" y={y + CELL - 3}>{dayName(day.date).slice(0, 3)}</text>
      {#each day.hours as hour, col (hour.start)}
        {@const kind = cellKind(hour, ends[row][col], sinceMs, nowMs)}
        {@const x = LABEL_W + col * PITCH}
        {#if kind === "zero"}
          <rect class="wk__zero" x={x + 0.5} y={y + 0.5} width={CELL - 1} height={CELL - 1} />
        {:else if kind === "data" || kind === "current"}
          {#if hour.airtime_s > 0}
            <rect class="wk__cell" data-step={rampStep(hour.airtime_s)} {x} {y} width={CELL} height={CELL} />
          {:else}
            <rect class="wk__zero" x={x + 0.5} y={y + 0.5} width={CELL - 1} height={CELL - 1} />
          {/if}
          {#if kind === "current"}<rect class="wk__now" x={x + 0.5} y={y + 0.5} width={CELL - 1} height={CELL - 1} />{/if}
        {/if}
        {#if focus && focus.row === row && focus.col === col}<rect class="wk__hot" x={x - 1} y={y - 1} width={CELL + 2} height={CELL + 2} />{/if}
      {/each}
      {#if !phone}<text class="wk__t" x={LABEL_W + gridW + 8} y={y + CELL - 3}>{fmt.total(airtime(row)).slice(3)}</text>{/if}
      {#if shown}
        <!-- selection brackets, 4 px outside the row -->
        {@const l = LABEL_W - 4}
        {@const r = LABEL_W + gridW + 2}
        {@const t = y - 2}
        {@const bt = y + CELL + 2}
        <path class="wk__sel" d="M{l} {t + 6}V{t}H{l + 6} M{r - 6} {t}H{r}V{t + 6} M{l} {bt - 6}V{bt}H{l + 6} M{r - 6} {bt}H{r}V{bt - 6}" />
      {/if}
    {/each}
  </svg>

  <div class="wk__key" aria-hidden="true">
    {#each KEY as k (k.step)}<span class="wk__sw" data-step={k.step}></span><span class="wk__kl">{k.label}</span>{/each}
    <span class="wk__kl">PER HOUR</span>
  </div>
</section>

<style>
  .wk { padding: 0 16px 8px; }
  .wk__read { display: flex; flex-wrap: wrap; align-items: center; column-gap: 12px; row-gap: 6px; min-height: 36px; padding-bottom: 6px; }
  .wk__title { font: 500 var(--fs-13)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink); white-space: nowrap; }
  .wk__totals { flex: 1; min-width: 0; font: 400 var(--fs-12)/1.2 var(--font-data); color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wk__svg { display: block; overflow: visible; max-width: 100%; shape-rendering: crispEdges; cursor: crosshair; user-select: none; touch-action: pan-y; }
  .wk__svg:focus-visible { outline: var(--stroke-emph) solid var(--state-select); outline-offset: 6px; }
  .wk__n, .wk__t { font-family: var(--font-data); font-size: var(--fs-11); fill: var(--ink-3); }
  .wk__t { fill: var(--ink-2); }
  .wk__d { font: 500 var(--fs-11) var(--font-label); letter-spacing: var(--track-label); fill: var(--ink-2); }
  .wk__d.is-today { fill: var(--ink); }
  .wk__zero { fill: none; stroke: var(--grid); stroke-width: 1; }
  .wk__now { fill: none; stroke: var(--line); stroke-width: 1; }
  .wk__hot { fill: none; stroke: var(--ink); stroke-width: 1; }
  .wk__sel { fill: none; stroke: var(--state-select); stroke-width: 1.5; }
  .wk__cell[data-step="2"], .wk__sw[data-step="2"] { fill: var(--ramp-2); background: var(--ramp-2); }
  .wk__cell[data-step="3"], .wk__sw[data-step="3"] { fill: var(--ramp-3); background: var(--ramp-3); }
  .wk__cell[data-step="4"], .wk__sw[data-step="4"] { fill: var(--ramp-4); background: var(--ramp-4); }
  .wk__cell[data-step="5"], .wk__sw[data-step="5"] { fill: var(--ramp-5); background: var(--ramp-5); }
  .wk__key { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
  .wk__sw { width: 10px; height: 10px; }
  .wk__kl { margin-right: 8px; font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-3); }

  @media (min-width: 900px) {
  }
</style>
