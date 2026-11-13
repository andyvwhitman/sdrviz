<svelte:options namespace="svg" />
<script lang="ts">
  /**
   * The schematic network: route chains and station marks morph from their geo positions (`u` 0 to 1), the
   * labels and names fade in as a group. Static text comes from the layout; nothing here is placed.
   */
  import { lerp, type Pt } from "./lib/geom";
  import { easeInOut } from "./lib/ease";
  import { dPath } from "./lib/path";
  import type { SchematicLayout } from "./lib/schematicLayout";
  import { TERMINALS } from "./lib/labelPlacer";
  import SchematicText from "./SchematicText.svelte";

  interface Props {
    layout: SchematicLayout;
    /** where each schematic item sits in the geo view, by item key */
    geoOf: Record<string, Pt>;
    u: number;
    onselect: (placeId: string) => void;
  }
  let { layout, geoOf, u, onselect }: Props = $props();

  const e = $derived(easeInOut(u));
  const opacity = $derived(Math.min(1, u * 1.6).toFixed(2));
  const at = (key: string): Pt => lerp(geoOf[key] ?? layout.pos[key].xy, layout.pos[key].xy, e);
  const f1 = (v: number): string => (Math.round(v * 10) / 10).toString();
</script>

<g style:opacity={u} style:display={u === 0 ? "none" : ""}>
  {#each layout.texts as label, i (i)}<SchematicText {label} />{/each}
  {#each layout.names as label, i (i)}<SchematicText {label} />{/each}
  {#if layout.penn}
    {#if layout.penn.tie}<path class="s-hair k-ink3" d="M{layout.penn.tie[0][0]} {f1(layout.penn.tie[0][1])}V{f1(layout.penn.tie[1][1])}" />{/if}
    {#each layout.penn.lines as label (label.text)}<SchematicText {label} />{/each}
  {/if}
</g>
{#if u > 0}
  {#each Object.entries(layout.chains) as [rid, keys] (rid)}
    <path class="{rid === 'r-nec' ? 's-emph' : 's-hair'} k-line" style:opacity={opacity} d={dPath(keys.map(at))} />
  {/each}
  {#each Object.entries(layout.pos) as [key, it] (key)}
    {@const [x, y] = at(key)}
    {@const id = it.p.place_id}
    {#if it.p.kind === "detector"}
      <path class="s-hair k-line mp-f-void" style:opacity={opacity} d="M{f1(x)} {f1(y - 4.5)}l4.5 4.5l-4.5 4.5l-4.5 -4.5Z" />
    {:else if TERMINALS.has(id) && it.rid === "r-nec"}
      <rect class="s-emph k-ink mp-f-void" style:opacity={opacity} x={f1(x - 7)} y={f1(y - 7)} width="14" height="14" />
    {:else if !TERMINALS.has(id)}
      <path
        class="s-emph k-ink mp-hit"
        style:opacity={opacity}
        role="button"
        tabindex="-1"
        onclick={() => onselect(id)}
        onkeydown={(ev) => ev.key === "Enter" && onselect(id)}
        d={it.rid === "r-metro" ? `M${f1(x - 4)} ${f1(y)}h8` : `M${f1(x)} ${f1(y - 4)}v8`}
      />
    {/if}
  {/each}
{/if}
