<svelte:options namespace="svg" />
<script lang="ts">
  /**
   * Real trains (GTFS-Realtime and Amtraker positions), each a VehicleMark with its name. In the geo view
   * a train sits at its GPS position; in the schematic it is snapped onto the nearest route by route mile and
   * placed where that mile falls on the schematic, morphing between the two with the mode switch. A train that
   * is on no route fades out of the schematic.
   */
  import type { Vehicle } from "$lib/types/transit";
  import { easeInOut } from "./lib/ease";
  import { lerp, type Pt } from "./lib/geom";
  import { snapVehicle } from "./lib/liveTrains";
  import type { LonLat } from "./lib/project";
  import { schematicTrainPosition, type SchematicLayout } from "./lib/schematicLayout";
  import type { Route } from "./lib/types";
  import { ageNow, isStale, thinByGrid, trainTitle } from "./lib/transitView";
  import VehicleMark from "./VehicleMark.svelte";

  interface Props {
    vehicles: Vehicle[];
    routes: Route[];
    project: (p: LonLat) => Pt;
    schLayout: SchematicLayout | null;
    /** 0 geo to 1 schematic */
    u: number;
    width: number;
    height: number;
    /** map zoom: far out the names are dropped, the marks stay */
    k: number;
    /** when `vehicles` arrived (ms) */
    fetchedAt: number;
    selectedId: string | null;
    onselect: (id: string) => void;
    /** the trains currently drawn: the ones in the window */
    ondrawn?: (vehicles: Vehicle[]) => void;
  }
  let { vehicles, routes, project, schLayout, u, width, height, k, fetchedAt, selectedId, onselect, ondrawn }: Props = $props();

  const eased = $derived(easeInOut(u));
  const MARGIN = 12;
  const angleOf = (v: Pt): number => (Math.atan2(v[1], v[0]) * 180) / Math.PI;

  /** screen heading of a compass bearing at a position, whatever the projection's rotation */
  function geoHeading(v: Vehicle, at: Pt): Pt {
    const b = ((v.bearing ?? 90) * Math.PI) / 180;
    const step = 0.002;
    const ahead = project([v.lon + (Math.sin(b) * step) / Math.cos((v.lat * Math.PI) / 180), v.lat + Math.cos(b) * step]);
    const d = Math.hypot(ahead[0] - at[0], ahead[1] - at[1]) || 1;
    return [(ahead[0] - at[0]) / d, (ahead[1] - at[1]) / d];
  }

  const drawn = $derived(
    vehicles.flatMap((v) => {
      const geo = project([v.lon, v.lat]);
      const heading = geoHeading(v, geo);
      const snap = schLayout && u > 0 ? snapVehicle(routes, v) : null;
      const sch = snap && schLayout ? schematicTrainPosition(schLayout.pos, snap) : null;
      const onSchematic = !!sch;
      if (u === 1 && !onSchematic) return [];
      if (u === 0 && (geo[0] < -MARGIN || geo[0] > width + MARGIN || geo[1] < -MARGIN || geo[1] > height + MARGIN)) return [];
      const pos = sch ? lerp(geo, sch.xy, eased) : geo;
      const dir = sch ? (u < 0.5 ? heading : (snap!.sign < 0 ? [-sch.dir[0], -sch.dir[1]] : sch.dir) as Pt) : heading;
      return [{ v, pos, angle: angleOf(dir), opacity: onSchematic ? 1 : 1 - Math.min(1, u * 1.6) }];
    }),
  );

  // names where there is room for them, the selected train's always
  const CROWDED_ZOOM = 0.2;
  const NAME_ZOOM = 0.35;
  const NAME_CELL = 90;
  const named = $derived(
    new Set(
      (u > 0.5 || k >= NAME_ZOOM ? thinByGrid(drawn, (t) => t.pos, NAME_CELL) : []).map((t) => t.v.id),
    ),
  );

  $effect(() => ondrawn?.(drawn.filter((t) => t.opacity > 0.5).map((t) => t.v)));
</script>

<g class="mp-live-trains">
  {#each drawn as t (t.v.id)}
    <g style:opacity={t.opacity.toFixed(2)}>
      <VehicleMark
        pos={t.pos} angle={t.angle} selected={selectedId === t.v.id}
        scale={k < CROWDED_ZOOM ? 0.7 : 1} estimated={t.v.position === "estimated"} stale={isStale(ageNow(t.v.age_s, fetchedAt, Date.now()), t.v.stale_after_s)}
        onselect={() => onselect(t.v.id)}
      />
      {#if named.has(t.v.id) || selectedId === t.v.id}
        <text class="mp-vlabel" x={(t.pos[0] + 16).toFixed(1)} y={(t.pos[1] + 4).toFixed(1)}>{trainTitle(t.v)}</text>
      {/if}
    </g>
  {/each}
</g>
