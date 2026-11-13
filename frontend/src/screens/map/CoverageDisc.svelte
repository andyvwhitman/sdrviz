<svelte:options namespace="svg" />
<script lang="ts">
  /**
   * M5 range rings every 5 km with a dashed outline, plus the M23 hatch clipped to the disc. At rest the hatch is
   * +45 degrees in line-faint; an unacknowledged fault turns it -45 degrees in state-fault-dim (spec 4.5), so a
   * faulted disc reads by pattern in grayscale. A stale or faulted feed's contour is dashed, acked or not.
   */
  import type { FeedLook } from "./lib/inputs";
  import type { RingLabel } from "./lib/geoLayout";
  import { dPath } from "./lib/path";
  import { circle, type LonLat } from "./lib/project";
  import type { Pt } from "./lib/geom";

  interface Props {
    index: number;
    centre: LonLat;
    radiusKm: number;
    look: FeedLook;
    labels: RingLabel[];
    project: (p: LonLat) => Pt;
    width: number;
    height: number;
  }
  let { index, centre, radiusKm, look, labels, project, width, height }: Props = $props();

  const ringPath = (km: number): string => dPath(circle(centre, km, 3).map(project), true);
  const unackedFault = $derived(look.fault && !look.acked);
  const degraded = $derived(look.stale || look.fault);
  const rings = $derived(Array.from({ length: Math.max(0, Math.ceil(radiusKm / 5) - 1) }, (_, i) => (i + 1) * 5).filter((km) => km < radiusKm));
</script>

<g class="mp-cov">
  <defs>
    <pattern id="mp-hatch-{index}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate({unackedFault ? 45 : -45}) translate(0 {index * 2})">
      <path class="s-hair {unackedFault ? 'k-fault-dim' : 'k-faint'}" d="M0 0.5H8" />
    </pattern>
    <clipPath id="mp-cov-{index}"><path d={ringPath(radiusKm)} /></clipPath>
  </defs>
  <rect x="0" y="0" {width} {height} fill="url(#mp-hatch-{index})" clip-path="url(#mp-cov-{index})" class={unackedFault ? "" : "hatch-rest"} />
  {#each rings as km (km)}
    <path class="s-hair k-faint" class:d-stale={degraded} d={ringPath(km)} />
  {/each}
  <path class="s-hair {degraded ? 'k-stale d-stale' : 'k-line d-threshold'}" d={ringPath(radiusKm)} />
  {#each labels as label (label.km)}
    <text class="mp-coord" x={label.x.toFixed(1)} y={label.y.toFixed(1)}>{label.km} KM</text>
  {/each}
</g>
