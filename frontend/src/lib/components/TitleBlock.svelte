<script lang="ts">
  /** M10 title block, short, in the footer (spec 5.18): `WLT-1 · SCREEN <name> · <scope> · BUILD <b> [SIM]`. The clock is in the bar. */
  import SimTag from "./SimTag.svelte";

  interface Props {
    screen: string;
    scope?: [string, string] | null;
    build?: string;
    sim?: boolean;
    osm?: boolean;
    /** a narrow window keeps only the build and the map credit */
    compact?: boolean;
  }
  let { screen, scope = null, build = "SIM-S3", sim = true, osm = false, compact = false }: Props = $props();
</script>

<div class="title-block">
  {#if !compact}
    <div><span class="v is-sheet">WLT-1</span></div>
    <div><span class="k">SCREEN</span><span class="v">{screen}</span></div>
    {#if scope}<div><span class="k">{scope[0]}</span><span class="v">{scope[1]}</span></div>{/if}
  {/if}
  <div><span class="k">BUILD</span><span class="v">{build}</span>{#if sim}<SimTag />{/if}</div>
  {#if osm}<div><a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a></div>{/if}
</div>
