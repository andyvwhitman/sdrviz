<script lang="ts">
  /** Coverage thumbnail: radius rings every 5 km and the M23 hatch (spec 11.14). */
  import type { Feed } from "$lib/types/live";
  import RegMark from "../system/RegMark.svelte";
  import { coverageModel, THUMB_H, THUMB_W } from "./coverage";
  import type { GeoRoute } from "./types";

  interface Props {
    feed: Feed;
    others: Feed[];
    routes: GeoRoute[];
    /** unacknowledged fault: -45 degree hatch in state-fault-dim and a red mark */
    fault: boolean;
    markTone: "line" | "stale" | "fault";
  }
  let { feed, others, routes, fault, markTone }: Props = $props();

  const model = $derived(coverageModel(feed, others, routes, fault));
</script>

<svg class="hud fb-svg" width={THUMB_W} height={THUMB_H} viewBox="0 0 {THUMB_W} {THUMB_H}">
  <rect x="0" y="0" width={THUMB_W} height={THUMB_H} fill="var(--bg-void)" />
  {#if model}
    <defs>
      <clipPath id="fb-cv-box"><rect x="1" y="1" width={THUMB_W - 2} height={THUMB_H - 2} /></clipPath>
      <clipPath id="fb-cv-ring"><circle cx={model.cx} cy={model.cy} r={model.radius} /></clipPath>
    </defs>
    <g clip-path="url(#fb-cv-ring)"><path class="hatch" class:is-fault={fault} d={model.hatch} /></g>
    <g clip-path="url(#fb-cv-box)">
      {#each model.routePaths as route}<path class="s-hair {route.main ? 'k-line' : 'k-faint'}" d={route.d} />{/each}
      {#each model.rings as r}<circle class="s-hair k-faint" cx={model.cx} cy={model.cy} {r} />{/each}
      <circle class="s-hair k-line d-threshold" cx={model.cx} cy={model.cy} r={model.radius} />
    </g>
    <RegMark x={model.cx} y={model.cy} tone={markTone} />
    <path class="s-hair k-line" d="M{model.north.x1.toFixed(1)} {model.north.y1.toFixed(1)}L{model.north.x2.toFixed(1)} {model.north.y2.toFixed(1)}" />
    <text class="lab" x={model.north.lx.toFixed(1)} y={model.north.ly.toFixed(1)} text-anchor="middle">N</text>
    {#each model.sites as s}<circle class="site" cx={s.x.toFixed(1)} cy={s.y.toFixed(1)} r="2" />{/each}
    {#each model.labels as l}
      <text class="{l.cls} fb-halo" x={l.x.toFixed(1)} y={l.y.toFixed(1)} text-anchor={l.anchor}>{l.text}</text>
    {/each}
  {/if}
  <rect class="s-hair k-faint" x="0.5" y="0.5" width={THUMB_W - 1} height={THUMB_H - 1} />
  <RegMark x={0} y={0} />
</svg>
