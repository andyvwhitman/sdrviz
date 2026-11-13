<script lang="ts">
  /** Hero strip: one 48 px range figure, 32 px secondaries (TRANSMISSIONS, AIRTIME), range controls on the right. */
  import Chip from "$lib/components/Chip.svelte";
  import { hm } from "./geometry";
  import { SPANS, type SpanLabel } from "./store.svelte";
  import type { Range, Summary } from "./types";

  interface Props {
    summary: Summary;
    range: Range;
    span: SpanLabel;
    channels: number;
    tz: string;
    clock: string;
    /** "YESTERDAY · 11-09" or "EARLIER TODAY" for a range that is not live */
    when: string;
    onstep: (delta: number) => void;
    onspan: (span: SpanLabel) => void;
    onnow: () => void;
  }
  let { summary, range, span, channels, tz, clock, when, onstep, onspan, onnow }: Props = $props();

  const hours = $derived((range.end_t - range.start_t) / 3600);
</script>

<span class="hero__big">{hm(range.start_t)}–{hm(range.end_t)}<span class="z">{tz}</span></span>
<span class="hero__stack"><span class="a">RANGE · {Number.isInteger(hours) ? hours : hours.toFixed(2)} H</span><span class="b">{range.live ? `ENDS NOW · ${clock.slice(0, 5)}` : when}</span></span>
<span class="hi-rule"></span>
<span class="hero__big is-sm">{summary.totals.count}</span>
<span class="hero__stack"><span class="a">TRANSMISSIONS</span><span class="b">ON {channels} CHANNELS</span></span>
<span class="hi-rule"></span>
<span class="hero__big is-sm">{summary.totals.airtime_label}</span>
<span class="hero__stack"><span class="a">AIRTIME</span><span class="b">HH:MM:SS · ALL CHANNELS</span></span>
<span class="hero__aside">
  <span class="hi-step">
    <Chip kind="nominal" button onclick={() => onstep(-3600)} text="◂ 1 H" />
    <Chip kind="nominal" button onclick={() => onstep(3600)} text="1 H ▸" />
  </span>
  <span class="hi-step">
    {#each Object.keys(SPANS) as label (label)}
      <Chip kind="filter" button pressed={label === span} onclick={() => onspan(label as SpanLabel)} text={label} />
    {/each}
  </span>
  <Chip kind={range.live ? "active" : "nominal"} button onclick={onnow} text="TO NOW" />
</span>
