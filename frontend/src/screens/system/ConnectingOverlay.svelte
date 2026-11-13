<script lang="ts">
  /**
   * LOADING and CONNECTING (spec 8.6): the Live Ops layout with every value blank, so the wall does
   * not jump when data arrives. Boxes only: nothing here is drawn from data.
   */
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import Chip from "$lib/components/Chip.svelte";
  import { BLANK } from "$lib/hud/fmt";
  import FrequencyRuler from "./FrequencyRuler.svelte";
  import RegMark from "./RegMark.svelte";
  import { snap } from "./ruler";
  import "./system.css";

  const WALL_W = 1656;
  const SPEC_H = 72;
  const LOFAR_W = 184;
  const LOFAR_H = 120;

  /** one CTC row per route, named from the route table */
  let routes = $state<string[]>([]);
  onMount(() => {
    api.geo.routes().then(
      (geo) => (routes = ((geo as { routes?: { name: string }[] }).routes ?? []).map((r) => r.name)),
      () => {}, // the names are decoration; the boxes stand without them
    );
  });

  const graticule =
    Array.from({ length: 9 }, (_, i) => `M${snap((WALL_W * (i + 1)) / 10)} 0V${SPEC_H}`).join("") +
    Array.from({ length: 7 }, (_, j) => `M0 ${snap((SPEC_H * (j + 1)) / 8)}H${WALL_W}`).join("");
</script>

<div class="sy-abs sy-hero hero">
  <span class="hero__text">LAST KEY-UP</span><span class="hero__big is-blank">{BLANK}</span>
  <span class="hero__aside"><Chip button kind="nominal" text="FEED · {BLANK} ▾" /></span>
</div>

<svg class="hud sy-svg sy-abs sy-wall-spec" width={WALL_W} height={SPEC_H} viewBox="0 0 {WALL_W} {SPEC_H}">
  <g class="graticule"><path class="s-hair k-grid" d={graticule} /></g>
  <text class="num" x={WALL_W - 8} y="14" text-anchor="end">10 dB/div · 135 kHz/div</text>
  <rect class="s-hair k-faint" x="0.5" y="0.5" width={WALL_W - 1} height={SPEC_H - 1} />
  <RegMark x={0} y={0} />
</svg>
<svg class="hud sy-svg sy-abs sy-wall-ruler" width={WALL_W} height="32" viewBox="0 0 {WALL_W} 32">
  <FrequencyRuler w={WALL_W} h={32} />
</svg>
<div class="sy-abs sy-wall-wf bezel"></div>

<div class="sy-abs sy-lofar-lab"><span>LAST 60 MIN</span><span class="mono">{BLANK}</span></div>
<svg class="hud sy-svg sy-abs sy-lofar-ruler" width={LOFAR_W} height="16" viewBox="0 0 {LOFAR_W} 16">
  <FrequencyRuler w={LOFAR_W} h={16} majorLabels={false} />
</svg>
<svg class="hud sy-svg sy-abs sy-lofar" width={LOFAR_W} height={LOFAR_H} viewBox="0 0 {LOFAR_W} {LOFAR_H}">
  <rect x="0" y="0" width={LOFAR_W} height={LOFAR_H} fill="var(--bg-void)" />
  <rect class="s-hair k-faint" x="0.5" y="0.5" width={LOFAR_W - 1} height={LOFAR_H - 1} />
  <RegMark x={0} y={0} />
</svg>

<div class="sy-abs sy-tiles br"><div class="sy-blank-panel"><span class="t-panel">CHANNELS</span><span class="mono">{BLANK}</span></div></div>

<section class="sy-abs sy-log txlog" aria-live="polite">
  <div class="txlog__head"><span class="t-panel">TRANSCRIPT</span><span class="grow"></span><Chip button kind="filter" text="BANK ONLY" pressed={false} /></div>
  <div class="txrow-empty">{BLANK}</div>
</section>

<svg class="hud sy-svg sy-abs sy-ctc" width="1856" height="120" viewBox="0 0 1856 120">
  {#each routes as name, i}
    <text class="lab" x="0" y={i * 24 + 16}>{name}</text>
    <text class="num" x="176" y={i * 24 + 16}>{BLANK}</text>
  {/each}
</svg>
