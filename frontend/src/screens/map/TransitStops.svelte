<svelte:options namespace="svg" />
<script lang="ts">
  /**
   * Stops from the transit API (GET /transit/stops): a diamond for an intercity station, a small circle for a
   * commuter stop. Click one for its board. Names show from a zoom where they have room, one per grid cell.
   */
  import { displayName } from "$lib/displayName";
  import type { Stop } from "$lib/types/transit";
  import { dist, type Pt } from "./lib/geom";
  import type { LonLat } from "./lib/project";
  import { thinByGrid } from "./lib/transitView";
  import SelectBracket from "./SelectBracket.svelte";

  interface Props {
    stops: Stop[];
    project: (p: LonLat) => Pt;
    width: number;
    height: number;
    /** map zoom */
    k: number;
    /** marks already on the map (the regional stations): a stop on top of one is not drawn again */
    avoid: Pt[];
    selectedId: string | null;
    onselect: (stopId: string) => void;
  }
  let { stops, project, width, height, k, avoid, selectedId, onselect }: Props = $props();

  const MARGIN = 20;
  const NAME_ZOOM = 1.2;
  const NAME_CELL = 120;

  const placed = $derived(
    stops
      .map((s) => ({ s, at: project([s.lon, s.lat]) }))
      .filter(({ at }) => at[0] > -MARGIN && at[0] < width + MARGIN && at[1] > -MARGIN && at[1] < height + MARGIN)
      .filter(({ at, s }) => s.id === selectedId || !avoid.some((a) => dist(a, at) < 7)),
  );
  const named = $derived(k >= NAME_ZOOM ? new Set(thinByGrid(placed.filter(({ s }) => s.kind === "intercity" || k >= 6), (p) => p.at, NAME_CELL).map((p) => p.s.id)) : new Set<string>());
  const names = $derived(placed.map(({ s }) => s.name));
  const f1 = (v: number): string => v.toFixed(1);
</script>

<g class="mp-tx-stops">
  {#each placed as { s, at } (s.id)}
    <g class="mp-hit" role="button" tabindex="-1" onclick={(e) => (e.stopPropagation(), onselect(s.id))} onkeydown={(e) => e.key === "Enter" && onselect(s.id)}>
      <circle class="mp-stop-hit" cx={f1(at[0])} cy={f1(at[1])} r="10" />
      {#if s.kind === "intercity"}
        <path class="s-emph k-ink f-void" d="M{f1(at[0])} {f1(at[1] - 5)}l5 5l-5 5l-5 -5Z" />
      {:else}
        <circle class="s-hair k-line f-void" cx={f1(at[0])} cy={f1(at[1])} r="3" />
      {/if}
      {#if s.id === selectedId}<SelectBracket x={at[0]} y={at[1]} o={11} a={10} />{/if}
      {#if named.has(s.id)}<text class="mp-stn" x={f1(at[0] + 9)} y={f1(at[1] + 4)}>{displayName(s, names)}</text>{/if}
    </g>
  {/each}
</g>
