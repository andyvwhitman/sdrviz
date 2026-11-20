<script lang="ts">
  /** What a phone shows in place of a screen that is built for a wide display (Live Ops, Feeds & Banks, Settings). */
  import { carryGlobals } from "$lib/params";
  import { followLink, router } from "$lib/router.svelte";
  import type { Route } from "../../routes";

  interface Props {
    route: Route;
  }
  let { route }: Props = $props();

  const globals = $derived(carryGlobals(router.search));
  const hrefOf = (path: string): string => path + (globals ? `?${globals}` : "");
</script>

<section class="ws" aria-labelledby="ws-title">
  <h1 class="ws__title" id="ws-title">{route.name} NEEDS A WIDER SCREEN</h1>
  <p class="ws__note">1280 PX OR MORE. THESE SCREENS WORK ON A PHONE:</p>
  <nav class="ws__links" aria-label="Phone screens">
    <a href={hrefOf("/spot")} onclick={followLink}>SPOT<span>Trains approaching you</span></a>
    <a href={hrefOf("/map")} onclick={followLink}>MAP<span>Trains, stations and feeds</span></a>
  </nav>
</section>

<style>
  .ws { padding: 40px 16px; display: grid; gap: 16px; max-width: 480px; }
  .ws__title { margin: 0; font: 600 var(--fs-24)/1.15 var(--font-label); letter-spacing: var(--track-title); text-transform: uppercase; color: var(--ink); }
  .ws__note { margin: 0; font: 500 var(--fs-15)/1.3 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink-2); }
  .ws__links { display: grid; gap: 12px; margin-top: 8px; }
  .ws__links a {
    display: grid; gap: 4px; min-height: 56px; padding: 12px 16px; align-content: center; border: 0;
    box-shadow: inset 0 0 0 1px var(--line-faint); color: var(--ink);
    font: 600 var(--fs-18)/1 var(--font-label); letter-spacing: 0.12em;
  }
  .ws__links a span { font: 400 var(--fs-13)/1.2 var(--font-read); letter-spacing: 0; text-transform: none; color: var(--ink-2); }
  .ws__links a:active { box-shadow: inset 0 0 0 1px var(--state-select); }
</style>
