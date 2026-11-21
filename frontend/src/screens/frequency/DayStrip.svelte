<script lang="ts">
  import Glyph from "$lib/components/Glyph.svelte";
  /**
   * The day strip (M26, size L): one column per 15 minutes, height = airtime on a fixed ladder (FS 1M ... 15M),
   * a ruler in the corridor's local time, the now line, the busiest bucket and long silences annotated. Hover,
   * touch-drag or the arrow keys read a bucket; a click or Enter jumps the log to it.
   */
  import * as fmt from "$lib/hud/fmt";
  import { viewport } from "$lib/stores/viewport.svelte";
  import type { DayActivity } from "$lib/types/recordings";
  import RangeSwitch from "./RangeSwitch.svelte";
  import { barHeight, busiest, endsOf, fullScale, geometry, hourMarks, kindOf, silences, spanLabel, totalsOf, unrecordedLead } from "./dayStrip";
  import { clockOf } from "./frequency";

  interface Props {
    day: DayActivity | null;
    /** the API could not be reached */
    failed: boolean;
    tz: string;
    /** "TODAY · TUE 17 NOV" or "MON 16 NOV" */
    heading: string;
    isToday: boolean;
    nowMs: number;
    /** seconds the channel has been keyed, or null: the current bucket fills orange and grows */
    keyedElapsed: number | null;
    /** the span the log was jumped to (UTC ms): its buckets are marked, with a tick under the ruler */
    jumped: { from: number; to: number } | null;
    /** when the newest recording started, for "LAST 2D 3H AGO" on an empty day */
    lastHeardMs: number | null;
    canBack: boolean;
    canForward: boolean;
    onstep: (direction: -1 | 1) => void;
    onjump: (index: number) => void;
    /** the phone's range switch (day strip or week grid) replaces the heading */
    range?: "day" | "week";
    dayLabel?: string;
    onrange?: (range: "day" | "week") => void;
    /** the Live Ops pane's open lid: a column, not a page (64 px plot, 48 px gutter) */
    pane?: boolean;
    /** pane: the column is phone-narrow (under 480 px): the phone's 56 px plot, no gutter, short readout */
    narrow?: boolean;
  }
  let { day, failed, tz, heading, isToday, nowMs, keyedElapsed, jumped, lastHeardMs, canBack, canForward, onstep, onjump, range, dayLabel = "TODAY", onrange, pane = false, narrow = false }: Props = $props();

  /** the compact form: the phone's, or a pane narrower than 480 px */
  const phone = $derived(pane ? narrow : viewport.phone);
  const PLOT_H = $derived(phone ? 56 : pane ? 64 : 96);
  const TOP = $derived(phone ? 14 : 26);
  const GUTTER = $derived(phone ? 0 : pane ? 48 : 64);
  const LABEL_PX = 7.4; // an approximate glyph width of the 11-step label type, to see whether a label fits its span

  let width = $state(0);
  let hover = $state<number | null>(null);
  let cursor = $state<number | null>(null);
  let svg = $state<SVGSVGElement>();

  const buckets = $derived(day?.buckets ?? []);
  const ends = $derived(endsOf(buckets));
  const sinceMs = $derived(day?.recording_since ? Date.parse(day.recording_since) : null);
  const kinds = $derived(buckets.map((b, i) => kindOf(b, ends[i], sinceMs, nowMs, isToday)));
  const scale = $derived(fullScale(buckets));
  const plotW = $derived(Math.max(0, width - GUTTER));
  const geo = $derived(geometry(plotW, buckets.length));
  const used = $derived(geo.pitch * buckets.length);
  const totals = $derived(totalsOf(buckets));
  const top = $derived(busiest(buckets));
  const everRecorded = $derived(sinceMs !== null);
  const marks = $derived(hourMarks(buckets, tz));
  const majorEvery = $derived(phone ? 6 : 3);
  const zoneName = $derived(tz === "UTC" ? "UTC" : (new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(nowMs).find((p) => p.type === "timeZoneName")?.value ?? ""));

  const x = (index: number): number => index * geo.pitch;
  const nowIndex = $derived(buckets.findIndex((_, i) => kinds[i] === "current"));
  const nowX = $derived.by(() => {
    if (!isToday || nowIndex < 0) return null;
    const fraction = (nowMs - Date.parse(buckets[nowIndex].start)) / (ends[nowIndex] - Date.parse(buckets[nowIndex].start));
    return Math.round(x(nowIndex) + fraction * geo.pitch);
  });

  const silent = $derived(silences(kinds, 4, phone ? 1 : 3));
  const lead = $derived(unrecordedLead(kinds));
  const runLabel = (from: number, to: number, prefix: string): string => `${prefix} ${clockOf(buckets[from].start, tz).slice(0, 5)}–${clockOf(ends[to - 1], tz).slice(0, 5)}`;

  const height = (i: number): number => barHeight(buckets[i], scale, PLOT_H);
  const liveHeight = $derived.by(() => {
    if (keyedElapsed === null || nowIndex < 0) return null;
    return Math.min(PLOT_H, Math.max(2, Math.round(((buckets[nowIndex].airtime_s + keyedElapsed) / (scale * 60)) * PLOT_H)));
  });

  const focus = $derived(hover ?? cursor);
  const reading = $derived.by(() => {
    if (failed && !day) return fmt.BLANK;
    if (focus !== null && buckets[focus]) {
      const b = buckets[focus];
      const span = spanLabel(b, ends[focus], tz);
      if (kinds[focus] === "unrecorded") return `${span} · NOT RECORDED`;
      if (kinds[focus] === "future") return span;
      return `${span} · ${b.count} TX · ${fmt.total(b.airtime_s)} AIR`;
    }
    if (!everRecorded) return "NOT RECORDED";
    if (totals.count === 0) {
      const ago = isToday && lastHeardMs !== null ? ` · LAST ${fmt.age((nowMs - lastHeardMs) / 1000)} AGO` : "";
      return `NO TRANSMISSIONS${isToday ? " TODAY" : ""}${ago}`;
    }
    return phone
      ? `${totals.count} TX · ${fmt.total(totals.airtimeS)} AIR · BUSIEST ${clockOf(buckets[top].start, tz).slice(0, 5)}`
      : `${totals.count} TX · ${fmt.total(totals.airtimeS)} AIR · BUSIEST ${spanLabel(buckets[top], ends[top], tz)}`;
  });
  const summary = $derived(
    `${heading.replace(" · ", ", ")}, ${totals.count} transmissions, ${Math.round(totals.airtimeS / 60)} minutes of airtime${top >= 0 ? `, busiest ${spanLabel(buckets[top], ends[top], tz).replace("–", " to ")}` : ""}`,
  );

  function indexAt(event: PointerEvent | MouseEvent): number | null {
    if (!svg || !buckets.length) return null;
    const box = svg.getBoundingClientRect();
    const i = Math.floor((event.clientX - box.left) / geo.pitch);
    return i >= 0 && i < buckets.length ? i : null;
  }

  function keydown(event: KeyboardEvent): void {
    const step = event.shiftKey ? 4 : 1;
    const last = buckets.length - 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation(); // the page's seek keys use the arrows too
      cursor = Math.min(last, Math.max(0, (cursor ?? (nowIndex >= 0 ? nowIndex : last)) + (event.key === "ArrowLeft" ? -step : step)));
    } else if (event.key === "Enter" && cursor !== null) {
      event.preventDefault();
      event.stopPropagation();
      onjump(cursor);
    }
  }

  const yOf = (h: number): number => TOP + PLOT_H - h;
  const baseY = $derived(TOP + PLOT_H);
  const svgHeight = $derived(baseY + 8 + 18 + 22);
</script>

<section class="ds" class:ds--pane={pane} aria-label="Activity, {heading}">
  <div class="ds__read">
    {#if range && onrange}<RangeSwitch {range} {dayLabel} {onrange} />{:else}<span class="ds__day">{heading}</span>{/if}
    <span class="ds__steps">
      <button type="button" aria-label="Previous day" disabled={!canBack} onclick={() => onstep(-1)}><Glyph name="chevron-left" size={14} /></button>
      <button type="button" aria-label="Next day" disabled={!canForward} onclick={() => onstep(1)}><Glyph name="chevron-right" size={14} /></button>
    </span>
    {#if phone && day}<span class="ds__fs">FS {scale}M</span>{/if}
    <span class="ds__totals" aria-live="off">{reading}</span>
  </div>

  <div class="ds__plot" bind:clientWidth={width}>
    {#if width > 0}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <svg
        bind:this={svg}
        class="ds__svg"
        width={width}
        height={svgHeight}
        role="group"
        tabindex="0"
        aria-label={summary}
        onpointermove={(e) => (hover = indexAt(e))}
        onpointerleave={() => (hover = null)}
        onclick={(e) => {
          const i = indexAt(e);
          if (i !== null && kinds[i] !== "future") (cursor = i, onjump(i));
        }}
        onkeydown={keydown}
        onblur={() => (cursor = null)}
      >
        <g class="ds__bars">
          {#each buckets as b, i (b.start)}
            {@const kind = kinds[i]}
            {@const picked = !!jumped && Date.parse(b.start) >= jumped.from && Date.parse(b.start) < jumped.to}
            {#if kind === "data" || kind === "current"}
              {#if kind === "current" && liveHeight !== null}
                <rect class="ds__live" x={x(i)} y={yOf(liveHeight)} width={geo.bar} height={liveHeight} />
              {:else if kind === "current"}
                {@const h = Math.max(3, height(i))}
                <rect class="ds__cur" x={x(i) + 0.5} y={yOf(h) + 0.5} width={Math.max(1, geo.bar - 1)} height={h - 1} />
              {:else}
                <rect class="ds__bar" class:is-hot={focus === i} class:is-picked={picked} x={x(i)} style="y: {yOf(height(i))}px; height: {height(i)}px" width={geo.bar} />
              {/if}
            {:else if kind === "zero"}
              <rect class="ds__zero" class:is-hot={focus === i} x={x(i)} y={baseY - 1} width={geo.bar} height="1" />
            {/if}
            {#if picked}<rect class="ds__tick" x={x(i)} y={baseY + 1} width={geo.bar} height="1.5" />{/if}
          {/each}
        </g>

        <!-- not recorded: a dotted hairline along the baseline, never the zero floor tick -->
        {#each buckets as _, i (i)}
          {#if kinds[i] === "unrecorded" && (i === 0 || kinds[i - 1] !== "unrecorded")}
            {@const to = kinds.findIndex((k, j) => j > i && k !== "unrecorded")}
            <line class="ds__off" x1={x(i)} x2={x(to < 0 ? buckets.length : to)} y1={baseY - 0.5} y2={baseY - 0.5} />
          {/if}
        {/each}

        <!-- ruler -->
        <line class="ds__rule" x1="0" x2={used} y1={baseY + 0.5} y2={baseY + 0.5} />
        {#each marks as m (m.index)}
          {@const major = m.hour % majorEvery === 0}
          {#if !phone || major}
            <line class="ds__t" x1={x(m.index) + 0.5} x2={x(m.index) + 0.5} y1={baseY} y2={baseY + (major ? 8 : 4)} />
          {/if}
          {#if major}<text class="ds__n" x={x(m.index)} y={baseY + 22} text-anchor={m.index === 0 ? "start" : "middle"}>{String(m.hour).padStart(2, "0")}</text>{/if}
        {/each}
        {#if marks.length}<text class="ds__n" x={used} y={baseY + 22} text-anchor="middle">24</text>{/if}
        <text class="ds__z" x={used + 18} y={baseY + 22}>{zoneName}</text>

        <!-- the busiest bucket (desktop only; the phone has it in the readout) -->
        {#if !phone && top >= 0 && kinds[top] !== "current"}
          {@const bx = x(top) + geo.bar / 2}
          {@const label = `${clockOf(buckets[top].start, tz).slice(0, 5)} · ${fmt.total(buckets[top].airtime_s)}`}
          <line class="ds__lead" x1={bx} x2={bx} y1={yOf(height(top)) - 1} y2={yOf(height(top)) - 9} />
          <text class="ds__a" x={Math.min(Math.max(bx, label.length * 4.2), used - label.length * 4.2)} y={yOf(height(top)) - 13} text-anchor="middle">{label}</text>
        {/if}

        <!-- dimension lines: long silences, and the span before recording began -->
        {#each silent as run (run.from)}
          {@const x1 = x(run.from)}
          {@const x2 = x(run.to)}
          {@const label = runLabel(run.from, run.to, "NOTHING RECORDED")}
          {#if x2 - x1 > label.length * LABEL_PX + 16}
            <line class="ds__dim" x1={x1} x2={x2} y1={baseY + 8 + 18 + 16 - 4} y2={baseY + 8 + 18 + 16 - 4} />
            <line class="ds__dimt" x1={x1 + 0.5} x2={x1 + 0.5} y1={baseY + 8 + 18 + 10} y2={baseY + 8 + 18 + 18} />
            <line class="ds__dimt" x1={x2 - 0.5} x2={x2 - 0.5} y1={baseY + 8 + 18 + 10} y2={baseY + 8 + 18 + 18} />
            <text class="ds__d" x={(x1 + x2) / 2} y={baseY + 8 + 18 + 16} text-anchor="middle">{label}</text>
          {/if}
        {/each}
        {#if lead && everRecorded}
          {@const label = `RECORDING FROM ${clockOf(day!.recording_since!, tz).slice(0, 5)}`}
          {#if x(lead.to) > label.length * LABEL_PX + 16}
            <line class="ds__dim" x1="0" x2={x(lead.to)} y1={baseY + 8 + 18 + 12} y2={baseY + 8 + 18 + 12} />
            <text class="ds__d" x={x(lead.to) / 2} y={baseY + 8 + 18 + 16} text-anchor="middle">{label}</text>
          {/if}
        {/if}

        <!-- now -->
        {#if nowX !== null}
          <line class="ds__now" x1={nowX + 0.5} x2={nowX + 0.5} y1={TOP} y2={baseY + 8} />
          {#if !phone}<text class="ds__nowt" x={Math.max(30, Math.min(nowX, used - 30))} y={baseY + 8 + 18 + 16} text-anchor="middle">NOW {clockOf(nowMs, tz).slice(0, 5)}</text>{/if}
        {/if}

        <!-- the scale: printed like a scope's volts per division -->
        {#if !phone}
          <line class="ds__fsl" x1={used + 4} x2={used + 12} y1={TOP + 0.5} y2={TOP + 0.5} />
          <text class="ds__fst" x={used + 18} y={TOP + 5}>FS {scale}M</text>
        {/if}

        {#if !everRecorded && day}
          <text class="ds__empty" x={used / 2} y={TOP + PLOT_H / 2} text-anchor="middle">NO RECORDINGS YET</text>
        {/if}
      </svg>
    {/if}
  </div>
</section>

<style>
  .ds { padding: 0 16px 8px; background: var(--bg-void); }
  .ds--pane { padding-inline: 16px; }
  .ds__read { display: flex; flex-wrap: wrap; align-items: center; column-gap: 8px; min-height: 36px; row-gap: 6px; white-space: nowrap; }
  .ds__day { font: 500 var(--fs-13)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink); }
  .ds__steps { display: inline-flex; }
  .ds__steps button { width: 32px; height: 32px; font: 400 var(--fs-18)/1 var(--font-label); color: var(--ink-2); }
  .ds__steps button:disabled { color: var(--ink-3); opacity: 0.5; cursor: default; }
  .ds__steps button:not(:disabled):hover { color: var(--ink); }
  /* phone: the totals take their own line under the day and its steppers */
  .ds__totals { flex: 1 0 100%; order: 3; min-width: 0; overflow: hidden; text-overflow: ellipsis; padding-bottom: 4px; font: 400 var(--fs-12)/1.2 var(--font-data); color: var(--ink-2); }
  .ds__fs { margin-left: auto; font: 400 var(--fs-11)/1 var(--font-data); color: var(--ink-3); }
  .ds__plot { min-width: 0; }
  .ds__svg { display: block; overflow: visible; touch-action: pan-y; shape-rendering: crispEdges; cursor: crosshair; user-select: none; }
  .ds__svg:focus-visible { outline: var(--stroke-emph) solid var(--state-select); outline-offset: 4px; }

  .ds__bars { animation: ds-wipe 250ms linear 300ms both; }
  .ds--pane .ds__bars { animation-delay: 0ms; } /* the lid has just opened: write in at once */
  @keyframes ds-wipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
  @media (prefers-reduced-motion: reduce) { .ds__bars { animation: none; } }

  .ds__bar { fill: var(--line); transition: y 400ms ease-in-out, height 400ms ease-in-out; }
  .ds__bar.is-hot { fill: var(--ink); }
  .ds__bar.is-picked { fill: var(--state-select); }
  .ds__zero { fill: var(--grid); }
  .ds__zero.is-hot { fill: var(--ink-3); }
  .ds__cur { fill: none; stroke: var(--line); stroke-width: 1; }
  .ds__live { fill: var(--state-tx); }
  .ds__tick { fill: var(--state-select); }
  .ds__off { stroke: var(--state-offline); stroke-width: 1; stroke-dasharray: var(--dash-offline); stroke-linecap: round; }
  .ds__rule { stroke: var(--grid); stroke-width: 1; }
  .ds__t { stroke: var(--line-faint); stroke-width: 1; }
  .ds__n, .ds__z, .ds__a, .ds__d, .ds__nowt, .ds__fst { font-family: var(--font-data); font-size: var(--fs-11); fill: var(--ink-3); }
  .ds__a, .ds__nowt { fill: var(--ink-2); }
  .ds__d { font-family: var(--font-label); letter-spacing: var(--track-label); fill: var(--ink-3); paint-order: stroke; stroke: var(--bg-void); stroke-width: 6px; }
  .ds__lead { stroke: var(--line-faint); stroke-width: 1; }
  .ds__dim { stroke: var(--ink-3); stroke-width: 1; stroke-dasharray: var(--dash-measure); }
  .ds__dimt { stroke: var(--ink-3); stroke-width: 1; }
  .ds__now { stroke: var(--state-idle); stroke-width: 1; }
  .ds__fsl { stroke: var(--ink-3); stroke-width: 1; }
  .ds__empty { font: 500 var(--fs-13) var(--font-label); letter-spacing: var(--track-label); fill: var(--ink-2); }

  @media (min-width: 900px) {
    .ds:not(.ds--pane) { padding: 0 var(--margin-x) 8px; }
    .ds:not(.ds--pane) .ds__read { flex-wrap: nowrap; min-height: 32px; }
    .ds:not(.ds--pane) .ds__totals { flex: 1; order: 0; padding: 0 0 0 8px; }
  }
  /* the pane: the heading row wraps its totals under it while the column is narrow, as on the phone */
  @container pane (min-width: 480px) {
    .ds--pane .ds__read { flex-wrap: nowrap; min-height: 32px; }
    .ds--pane .ds__totals { flex: 1; order: 0; padding: 0 0 0 8px; }
  }
</style>
