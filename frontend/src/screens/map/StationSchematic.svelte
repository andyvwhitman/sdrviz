<script lang="ts">
  /** One terminal's track schematic (lib/stationSchematic.ts), drawn in the schematic style and scaled to the canvas. */
  import type { DetailCollection } from "./lib/detail";
  import { layoutStation, stationFacts, type StationConfig } from "./lib/stationSchematic";

  interface Props {
    config: StationConfig;
    detail: DetailCollection;
    width: number;
    height: number;
  }
  let { config, detail, width, height }: Props = $props();

  const layout = $derived(layoutStation(config, stationFacts(detail, config)));
  const CLS = { num: "mp-snum", mp: "mp-mp", stn: "mp-stn", linelab: "mp-linelab", term: "mp-term" } as const;
</script>

<svg class="hud mp-station" {width} {height} viewBox="0 0 {layout.width} {layout.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="{config.title.join(' ')} track schematic">
  {#each layout.paths as p, i (i)}<path class={p.cls} d={p.d} />{/each}
  {#each layout.diamonds as [x, y], i (i)}<path class="s-hair k-line mp-f-void" d="M{x} {y - 4}l4 4l-4 4l-4 -4Z" />{/each}
  <rect class="s-emph k-ink mp-f-void" x={layout.square[0] - 7} y={layout.square[1] - 7} width="14" height="14" />
  {#each layout.texts as t, i (i)}
    <text class={CLS[t.cls]} x={t.x} y={t.y} text-anchor={t.anchor ?? "start"} transform={t.rotate ? `rotate(${t.rotate} ${t.x} ${t.y})` : undefined}>{t.text}</text>
  {/each}
</svg>
