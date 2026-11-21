<script lang="ts">
  /**
   * The one bar (Sprint 6, B.3): mark, screen name, tabs, chips, clock and fullscreen. 36 px at 1:1 CSS pixels on
   * every route. Under 900 px it is 44 px and keeps the mark, the screen name, a short clock and a menu button.
   */
  import * as fmt from "$lib/hud/fmt";
  import { compactChips, headerChips, type ChipSpec } from "$lib/hud/chips";
  import { transitChips } from "$lib/hud/transitChips";
  import { carryGlobals, params } from "$lib/params";
  import { followLink, router } from "$lib/router.svelte";
  import { parseUtcOffset } from "$lib/time";
  import { link } from "$lib/stores/link.svelte";
  import { live } from "$lib/stores/live.svelte";
  import { session } from "$lib/stores/session.svelte";
  import { transit } from "$lib/stores/transit.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { viewport } from "$lib/stores/viewport.svelte";
  import { navFor, type Route } from "../../routes";
  import HeaderChips from "./HeaderChips.svelte";
  import HeaderNav from "./HeaderNav.svelte";

  /** at this window width and below the chips collapse so they never meet the tabs */
  const NARROW_HEADER_PX = 1440;

  interface Props {
    route: Route;
    /** a page-layout route scrolls under the bar: it sticks instead of sitting in a fixed stage */
    sticky?: boolean;
  }
  let { route, sticky = false }: Props = $props();

  const state = $derived(live.state);
  const linkDown = $derived(link.shownStatus === "reconnecting" || link.shownStatus === "no-link");
  /** `?force=loading|connecting`: the shell shows dashes, as before the first data (spec 8.4) */
  const blank = $derived(params.force === "loading" || params.force === "connecting");
  const narrow = $derived(viewport.width <= NARROW_HEADER_PX);

  const chips = $derived.by((): ChipSpec[] => {
    if (blank) return [{ text: `FEEDS ${fmt.BLANK}`, kind: "nominal" }, { text: `ASR ${fmt.BLANK}`, kind: "nominal" }];
    if (!state) return [];
    const all = headerChips(state);
    // the transit feeds' own chips, while the map is polling them
    if (transit.active) all.push(...transitChips({ sources: transit.sources, fetchedAt: transit.fetchedAt, failed: transit.failed, now: transit.now }));
    return narrow ? compactChips(all) : all;
  });

  const zone = $derived(state?.tz.name ?? "EST");
  const utcShift = $derived(state ? -parseUtcOffset(state.tz.utc_offset) : 5 * 3600);
  const clock = $derived(state ? fmt.clock(state.clock, ui.utc ? "UTC" : zone, utcShift) : fmt.BLANK);

  // the menu leads with what works on a phone; the screens that show a plate follow under their own label
  const tabs = $derived(navFor(session.isAdmin));
  const phoneReady = $derived(tabs.filter((r) => r.layout === "page" || r.phone === "page").sort((a, b) => Number(b.layout === "page") - Number(a.layout === "page")));
  const needsWider = $derived(tabs.filter((r) => !phoneReady.includes(r)));
  let menuOpen = $state(false);
  const globals = $derived(carryGlobals(router.search));
  const hrefOf = (path: string): string => path + (globals ? `?${globals}` : "");
  // a tab chosen from the menu closes it
  $effect(() => {
    void router.path;
    menuOpen = false;
  });
</script>

<header class="hud-header" class:hud-header--narrow={narrow} class:hud-header--sticky={sticky}>
  <div class="hud-header__left">
    <span class="hud-mark">SDRVIZ</span>
    <span class="hud-screen-name">{route.name}</span>
  </div>
  <!-- under 900 these two stay in the document (the Q-Y and F keys) but not on screen -->
  <div class="hud-header__nav"><HeaderNav /></div>
  <div class="hud-header__right">
    <HeaderChips {chips} {clock} reconnecting={linkDown} />
  </div>
  <div class="hud-header__phone">
    <button class="hud-clock" type="button" onclick={() => ui.toggleUtc()} title="Click to switch between local time and UTC">{clock.slice(0, 5)}</button>
    <button class="hud-menu" type="button" aria-expanded={menuOpen} aria-label="Menu" onclick={() => (menuOpen = !menuOpen)}>
      <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true"><path d="M0 1H20M0 7H20M0 13H20" stroke="currentColor" stroke-width="1.5" /></svg>
    </button>
  </div>
</header>

{#if menuOpen}
  <nav class="hud-sheet" aria-label="Screens">
    {#each phoneReady as item (item.id)}
      <a href={hrefOf(item.path)} onclick={followLink} aria-current={item.id === route.id ? "page" : undefined}>{item.name}</a>
    {/each}
    {#if needsWider.length}<span class="hud-sheet__k">WIDER SCREEN</span>{/if}
    {#each needsWider as item (item.id)}
      <a class="is-plate" href={hrefOf(item.path)} onclick={followLink} aria-current={item.id === route.id ? "page" : undefined}>{item.name}</a>
    {/each}
  </nav>
{/if}

<style>
  .hud-header__nav { display: block; }
  .hud-header__phone { display: none; }
  .hud-menu { display: grid; place-items: center; width: 44px; height: 44px; margin-right: -12px; border: 0; background: none; color: var(--ink); cursor: pointer; }

  .hud-sheet a {
    display: block; padding: 0 16px; border: 0; color: var(--ink);
    font: 500 var(--fs-13)/48px var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase;
  }
  .hud-sheet__k { padding: 12px 16px 0; font: 500 var(--fs-13)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); }
  .hud-sheet a.is-plate { color: var(--ink-2); }
  .hud-sheet a[aria-current="page"] { color: var(--state-select); box-shadow: inset 2px 0 0 var(--state-select); }

  @media (max-width: 899px) {
    .hud-header__nav, .hud-header__right { display: none; }
    .hud-header__phone { display: flex; align-items: center; margin-left: auto; gap: 4px; }
    .hud-header--narrow :global(.hud-screen-name) { display: inline; }
  }
</style>
