<script lang="ts">
  /** Where the page thinks you are standing, and how sure it is: a registration mark and a two-line readout. */
  import type { NearestLine } from "$lib/types/transit";
  import { distanceText } from "./spot";
  import type { LocateStatus, Spot } from "./spot.svelte";

  interface Props {
    spot: Spot | null;
    line: NearestLine | null;
    radiusKm: number;
    /** the station nearest the spot, when one is close */
    nearName: string | null;
    locate: LocateStatus;
    open: boolean;
    ontoggle: () => void;
    onsnap: () => void;
  }
  let { spot, line, radiusKm, nearName, locate, open, ontoggle, onsnap }: Props = $props();

  const far = $derived(!!line && line.distance_m > radiusKm * 1000);
  const how = $derived.by(() => {
    if (!spot) return "";
    if (spot.source === "gps") return `GPS ±${Math.round(spot.accuracyM ?? 0)} M`;
    return spot.source === "station" ? "PICKED STATION" : spot.source === "link" ? "FROM LINK" : "TYPED POSITION";
  });
  /* no milepost to name the spot by, so the place carries it: the given name, else the nearest station, else the coordinates */
  const heading = $derived(
    !spot ? "NO SPOT" : `SPOT \u00b7 ${spot.name ?? (nearName ? `NEAR ${nearName}` : `${spot.lat.toFixed(4)}, ${spot.lon.toFixed(4)}`)}`,
  );
  const sub = $derived.by(() => {
    if (!spot) return "PICK A STATION OR USE MY LOCATION";
    const parts = [how];
    if (line && !far) parts.push(`${distanceText(line.distance_m)} FROM TRACK`);
    return parts.join(" · ");
  });
</script>

<div class="sb">
  <button class="sb__main" type="button" aria-expanded={open} onclick={ontoggle}>
    <svg class="sb__mark" width="28" height="28" viewBox="-14 -14 28 28" aria-hidden="true">
      <circle r="6" /><path d="M-11 0H11M0 -11V11" />
    </svg>
    <span class="sb__text">
      <span class="sb__title">{heading}</span>
      <span class="sb__sub">{sub}</span>
    </span>
    <span class="sb__caret" aria-hidden="true">{open ? "▴" : "▾"}</span>
  </button>
  {#if far && line}
    <div class="sb__far">
      <span>NO TRACK WITHIN {radiusKm} KM · NEAREST AT {distanceText(line.distance_m)}</span>
      <button type="button" onclick={onsnap}>USE IT</button>
    </div>
  {/if}
</div>

<style>
  .sb__main { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 6px 16px; text-align: left; color: var(--ink); border-bottom: 1px solid var(--grid); }
  .sb__mark circle, .sb__mark path { stroke: var(--line); stroke-width: var(--sp-hair); fill: none; }
  .sb__mark { flex: none; }
  .sb__text { display: grid; min-width: 0; flex: 1; }
  .sb__title { font: 500 var(--fs-13)/1.25 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sb__sub { font: 400 var(--fs-11)/1.25 var(--font-data); color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sb__caret { color: var(--ink-2); }
  .sb__far { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 16px; font: 500 var(--fs-11)/1.3 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); text-transform: uppercase; border-bottom: 1px solid var(--grid); }
  .sb__far button { min-height: 44px; padding: 0 12px; color: var(--ink); box-shadow: inset 0 0 0 1px var(--line); font: 600 var(--fs-11) var(--font-label); letter-spacing: 0.12em; }
  @media (min-width: 900px) { .sb__main, .sb__far { padding-left: var(--margin-x); padding-right: var(--margin-x); } }
</style>
