<script lang="ts">
  /** M19 stringline: trains as strings over route miles x time, the selected string in select, plus the margin rail. */
  import Prims from "./Prims.svelte";
  import { buildStringline } from "./layout";
  import type { HistoryRow, Range, Route, RoutePoint, Train } from "./types";

  interface Props {
    route: Route;
    rows: HistoryRow[];
    trains: Train[];
    range: Range;
    now: number | null;
    tz: string;
    selectedTrain: string | null;
    pick: HistoryRow | null;
    pickPoint: RoutePoint | null;
    width: number;
    height: number;
    /** playback position of the picked clip, 0..1 */
    progress: number;
    onselect: (id: string) => void;
  }
  let { route, rows, trains, range, now, tz, selectedTrain, pick, pickPoint, width, height, progress, onselect }: Props = $props();

  const scene = $derived(buildStringline({ route, rows, trains, range, now, tz, selectedTrain, pick, pickPoint, width, height }));

  // Playback locates, it does not dominate: a quiet time hairline, an ink cap on the time axis and a short
  // ink notch where the selected string (or its rail tick) is at the playback time. Shown only mid-clip.
  const cursor = $derived.by(() => {
    if (!pick || progress <= 0 || progress >= 1) return null;
    const t = pick.t_offset_s + progress * pick.duration_s;
    const y = Math.round(scene.y(t));
    if (y < scene.py0 || y > scene.py1) return null;
    const at = scene.notch(t);
    return { y, at };
  });
</script>

<svg class="hud" {width} {height} viewBox="0 0 {width} {height}" aria-label="Stringline">
  <defs>
    <clipPath id="hi-clip"><rect x={scene.px0} y={scene.py0} width={scene.px1 - scene.px0} height={scene.py1 - scene.py0} /></clipPath>
  </defs>
  <Prims prims={scene.before} />
  <g clip-path="url(#hi-clip)"><Prims prims={scene.plot} /></g>
  {#each scene.hits as hit (hit.id)}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <circle class="hi-hit" cx={hit.x} cy={hit.y} r="8" onclick={() => onselect(hit.id)}><title>{hit.title}</title></circle>
  {/each}
  <Prims prims={scene.after} />
  {#if cursor}
    <path class="hi-hair" d="M{scene.px0} {cursor.y + 0.5}H{scene.px1}" />
    <path class="hi-cap" d="M{scene.px0 - 7} {cursor.y - 5}V{cursor.y + 5}L{scene.px0 - 1} {cursor.y}Z" />
    {#if cursor.at}<path class="hi-playhead" d="M{Math.round(cursor.at.x) - 12} {Math.round(cursor.at.y)}H{Math.round(cursor.at.x) + 12}" />{/if}
  {/if}
</svg>
