<script lang="ts">
  /**
   * The shell of a page-layout route: an ordinary scrolling document instead of the scaled stage. A slim sticky
   * header (mark, screen, clock, menu), the screen, and a status line at the foot. The tabs sit in the header from
   * tablet width up and in a menu below it.
   */
  import type { Snippet } from "svelte";
  import * as fmt from "$lib/hud/fmt";
  import { carryGlobals } from "$lib/params";
  import { followLink, router } from "$lib/router.svelte";
  import { parseUtcOffset } from "$lib/time";
  import { live } from "$lib/stores/live.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { NAV, type Route } from "../../routes";
  import HeaderNav from "./HeaderNav.svelte";

  interface Props {
    route: Route;
    children: Snippet;
  }
  let { route, children }: Props = $props();

  const snapshot = $derived(live.state);
  const zone = $derived(snapshot?.tz.name ?? "EST");
  const utcShift = $derived(snapshot ? -parseUtcOffset(snapshot.tz.utc_offset) : 5 * 3600);
  const clock = $derived(snapshot ? fmt.clock(snapshot.clock, ui.utc ? "UTC" : zone, utcShift) : fmt.BLANK);
  const short = $derived(clock.slice(0, 5));

  let menuOpen = $state(false);
  const globals = $derived(carryGlobals(router.search));
  const hrefOf = (path: string): string => path + (globals ? `?${globals}` : "");
  // a tab chosen from the menu closes it
  $effect(() => {
    void router.path;
    menuOpen = false;
  });
</script>

<div class="pg">
  <header class="pg__head">
    <span class="hud-mark">SDRVIZ</span>
    <span class="hud-screen-name">{route.name}</span>
    <span class="pg__grow"></span>
    <span class="pg__nav"><HeaderNav /></span>
    <button class="pg__clock hud-clock" type="button" onclick={() => ui.toggleUtc()} title="Click to switch between local time and UTC">
      <span class="pg__clock-full">{clock}</span><span class="pg__clock-short">{short}</span>
    </button>
    <button class="pg__menu" type="button" aria-expanded={menuOpen} aria-label="Menu" onclick={() => (menuOpen = !menuOpen)}>
      <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true"><path d="M0 1H20M0 7H20M0 13H20" stroke="currentColor" stroke-width="1.5" /></svg>
    </button>
  </header>

  {#if menuOpen}
    <nav class="pg__sheet" aria-label="Screens">
      {#each NAV as item (item.id)}
        <a href={hrefOf(item.path)} onclick={followLink} aria-current={item.id === route.id ? "page" : undefined}>{item.name}</a>
      {/each}
    </nav>
  {/if}

  <main class="pg__main" data-route={route.id}>
    {@render children()}
  </main>

  <footer class="pg__status">
    <span class="pg__status-text">{shell.statusFallback ?? ""}</span>
    <span class="pg__status-tb">WLT-1 · {route.name} · {clock}</span>
  </footer>
</div>

<style>
  .pg { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; background: var(--bg-void); }
  .pg__head {
    position: sticky; top: 0; z-index: 20; height: var(--header-h); display: flex; align-items: center; gap: 12px;
    padding: 0 16px; background: var(--bg-void); border-bottom: 1px solid var(--grid);
  }
  .pg__grow { flex: 1; }
  .pg__nav { display: none; }
  .pg__clock { background: none; border: 0; cursor: pointer; padding: 0 4px; }
  .pg__clock-full { display: none; }
  .pg__menu { display: grid; place-items: center; width: 44px; height: 44px; margin-right: -12px; color: var(--ink); }
  .pg__sheet {
    position: sticky; top: var(--header-h); z-index: 19; display: grid; background: var(--bg-raised); border-bottom: 1px solid var(--line-faint);
  }
  .pg__sheet a {
    display: block; padding: 0 16px; line-height: 48px; border: 0; color: var(--ink);
    font: 500 var(--fs-13)/48px var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase;
  }
  .pg__sheet a[aria-current="page"] { color: var(--state-select); box-shadow: inset 2px 0 0 var(--state-select); }
  .pg__main { flex: 1; min-width: 0; }
  .pg__status {
    display: flex; align-items: center; gap: 16px; min-height: var(--status-h); padding: 6px 16px;
    border-top: 1px solid var(--grid); font: 400 var(--fs-11)/1.2 var(--font-data); color: var(--ink-2);
  }
  .pg__status-text { flex: 1; min-width: 0; }
  .pg__status-tb { display: none; white-space: nowrap; color: var(--ink-3); }

  @media (min-width: 900px) {
    .pg__head { padding: 0 var(--margin-x); gap: 16px; }
    .pg__nav { display: block; }
    .pg__menu, .pg__sheet { display: none; }
    .pg__clock-full { display: inline; }
    .pg__clock-short { display: none; }
    .pg__status { padding: 0 var(--margin-x); }
    .pg__status-tb { display: block; }
  }
</style>
