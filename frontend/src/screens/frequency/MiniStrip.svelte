<script lang="ts">
  /**
   * The day strip, size M (M26): 96 buckets at a 2 px pitch (1 px bar, 1 px gap), 192 x 24, ticks at 00/06/12/18/24,
   * the full-scale step and the day's count beside it. No hover: the whole strip is a link to the frequency page.
   * Used by the Live Ops channel inspector and the frequency index.
   */
  import * as fmt from "$lib/hud/fmt";
  import { followLink } from "$lib/router.svelte";
  import type { ActivityBucket } from "$lib/types/recordings";
  import { barHeight, endsOf, fullScale, kindOf, totalsOf } from "./dayStrip";

  interface Props {
    buckets: ActivityBucket[];
    recordingSince: string | null;
    nowMs: number;
    /** the channel is keyed: the current bucket is orange */
    keyed?: boolean;
    /** seconds since the channel last spoke, for "LAST 4M" */
    lastS?: number | null;
    href: string;
    label: string;
  }
  let { buckets, recordingSince, nowMs, keyed = false, lastS = null, href, label }: Props = $props();

  const W = 192;
  const H = 24;
  const ends = $derived(endsOf(buckets));
  const since = $derived(recordingSince ? Date.parse(recordingSince) : null);
  const kinds = $derived(buckets.map((b, i) => kindOf(b, ends[i], since, nowMs, true)));
  const scale = $derived(fullScale(buckets));
  const totals = $derived(totalsOf(buckets));
  const nowIndex = $derived(kinds.indexOf("current"));
  const pitch = $derived(buckets.length ? Math.max(1, Math.floor(W / buckets.length)) : 2);
  const ticks = [0, 24, 48, 72, 96];
</script>

<a class="ms" {href} onclick={followLink} aria-label="{label}: {totals.count} transmissions today, open the frequency page">
  <svg width={W} height={H + 5} viewBox="0 0 {W} {H + 5}" shape-rendering="crispEdges" aria-hidden="true">
    {#each buckets as b, i (b.start)}
      {@const kind = kinds[i]}
      {#if kind === "data" || kind === "current"}
        {@const h = Math.max(kind === "current" && keyed ? 2 : 0, barHeight(b, scale, H))}
        {#if kind === "current" && !keyed}
          <rect class="ms__cur" x={i * pitch + 0.5} y={H - Math.max(3, h) + 0.5} width={Math.max(1, pitch - 2)} height={Math.max(3, h) - 1} />
        {:else}
          <rect class={kind === "current" ? "ms__tx" : "ms__bar"} x={i * pitch} y={H - h} width={Math.max(1, pitch - 1)} height={h} />
        {/if}
      {:else if kind === "zero"}
        <rect class="ms__zero" x={i * pitch} y={H - 1} width={Math.max(1, pitch - 1)} height="1" />
      {/if}
    {/each}
    {#each buckets as _, i (i)}
      {#if kinds[i] === "unrecorded" && (i === 0 || kinds[i - 1] !== "unrecorded")}
        {@const to = kinds.findIndex((k, j) => j > i && k !== "unrecorded")}
        <line class="ms__off" x1={i * pitch} x2={(to < 0 ? buckets.length : to) * pitch} y1={H - 0.5} y2={H - 0.5} />
      {/if}
    {/each}
    {#each ticks as t (t)}<line class="ms__tick" x1={Math.min(t * pitch, W - 1) + 0.5} x2={Math.min(t * pitch, W - 1) + 0.5} y1={H} y2={H + 4} />{/each}
    {#if nowIndex >= 0}<line class="ms__now" x1={nowIndex * pitch + 0.5} x2={nowIndex * pitch + 0.5} y1="0" y2={H + 4} />{/if}
  </svg>
  <span class="ms__text">
    <span class="ms__fs">FS {scale}M</span>
    <span>{totals.count} TX{lastS != null ? ` · LAST ${fmt.age(lastS)}` : ""}</span>
  </span>
</a>

<style>
  .ms { display: flex; align-items: flex-end; gap: 12px; border: 0; color: var(--ink-2); }
  .ms:hover { color: var(--ink); }
  .ms svg { flex: none; }
  .ms__text { display: grid; gap: 2px; font: 400 var(--fs-11)/1.1 var(--font-data); white-space: nowrap; }
  .ms__fs { color: var(--ink-3); }
  .ms__bar { fill: var(--line); }
  .ms__tx { fill: var(--state-tx); }
  .ms__cur { fill: none; stroke: var(--line); }
  .ms__zero { fill: var(--grid); }
  .ms__off { stroke: var(--state-offline); stroke-dasharray: var(--dash-offline); stroke-linecap: round; }
  .ms__tick { stroke: var(--line-faint); }
  .ms__now { stroke: var(--state-idle); }
</style>
