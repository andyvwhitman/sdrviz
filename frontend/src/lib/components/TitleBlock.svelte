<script lang="ts">
  /** M10 title block at the right end of the status line (spec 5.18). */
  import { BLANK } from "$lib/hud/fmt";
  import SimTag from "./SimTag.svelte";

  interface Props {
    screen: string;
    scope?: [string, string] | null;
    clock?: string;
    build?: string;
    sim?: boolean;
    osm?: boolean;
  }
  let { screen, scope = null, clock = BLANK, build = "SIM-S3", sim = true, osm = false }: Props = $props();
</script>

<div class="title-block">
  <div><span class="v is-sheet">WLT-1</span></div>
  <div><span class="k">SCREEN</span><span class="v">{screen}</span></div>
  {#if scope}<div><span class="k">{scope[0]}</span><span class="v">{scope[1]}</span></div>{/if}
  <div><span class="v hud-tb-clock">{clock}</span></div>
  <div><span class="k">BUILD</span><span class="v">{build}</span>{#if sim}<SimTag />{/if}</div>
  {#if osm}<div><a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a></div>{/if}
</div>
