<script lang="ts">
  /**
   * Hero strip (spec 5.27, brief 9.1.1): what is keyed now, or how long ago the bank last was, then
   * the off-bank count and the displayed-feed selector. The selector opens a small menu: inspect the
   * feed, or show another feed on the front wall.
   */
  import Chip from "$lib/components/Chip.svelte";
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import type { ChipKind } from "$lib/hud/chips";
  import * as fmt from "$lib/hud/fmt";
  import type { Fault, Feed } from "$lib/types/live";
  import type { Hero } from "./hero";

  interface Props {
    hero: Hero;
    feeds: readonly Feed[];
    displayed: Feed;
    faults: readonly Fault[];
    offBank: string | null;
    elsewhere: string | null;
    onshowfeed: (feedId: string) => void;
    oninspectfeed: (feedId: string) => void;
  }
  let { hero, feeds, displayed, faults, offBank, elsewhere, onshowfeed, oninspectfeed }: Props = $props();

  const fault = $derived(faults.find((f) => f.object === displayed.id));
  const selectorKind = $derived<ChipKind>(fault ? (fault.acked ? "acked" : "fault") : displayed.state === "stale" ? "degraded" : "active");
  const offBankParts = $derived(offBank?.match(/^(\+\d+ OFF-BANK)(.*)$/) ?? null);

  let menuOpen = $state(false);
  const pick = (action: () => void) => () => {
    menuOpen = false;
    action();
  };
</script>

<svelte:window onclick={() => (menuOpen = false)} onkeydown={(e) => e.key === "Escape" && (menuOpen = false)} />

<div class="hero lo-hero">
  {#if hero.mode === "keyed"}
    <span class="hero__big is-tx">{hero.aar4}</span>
    <span class="hero__stack"><span class="a">{hero.label}</span><span class="b">KEYED · VIA {hero.via}</span></span>
    <span class="hero__big is-tx">{fmt.dur(hero.elapsedS)}</span>
    {#if hero.othersLabel}<span class="hero__list">{hero.othersLabel}</span>{/if}
  {:else if hero.mode === "idle"}
    <span class="hero__text c-ink-2">LAST KEY-UP</span>
    <span class="hero__big is-2">{fmt.age(hero.ageS)}</span>
    <span class="hero__text c-ink-2">AGO · {hero.aar} · {hero.label}</span>
  {:else if hero.mode === "empty"}
    <span class="hero__text c-ink-2">NO CHANNELS IN THIS BANK</span>
  {:else}
    <span class="hero__text c-ink-2">NO KEY-UPS YET</span>
  {/if}

  <span class="hero__aside">
    {#if offBank}
      <span class="lo-offbank">{offBankParts ? offBankParts[1] : offBank}{#if offBankParts}<span class="mono">{offBankParts[2]}</span>{/if}</span>
    {/if}
    <span class="lo-selector">
      <Chip button kind={selectorKind} glyph={fault ? "fault" : undefined} text="FEED · {displayed.short} ▾" onclick={(e) => (e.stopPropagation(), (menuOpen = !menuOpen))} />
      {#if menuOpen}
        <div class="lo-menu br" role="menu">
          <button class="lo-menu__item" role="menuitem" onclick={pick(() => oninspectfeed(displayed.id))}>INSPECT {displayed.short}</button>
          {#each feeds as feed (feed.id)}
            <button class="lo-menu__item" role="menuitemradio" aria-checked={feed.id === displayed.id} onclick={pick(() => onshowfeed(feed.id))}>
              <PositionGlyph state={feed.state === "fault" ? "fault" : feed.state === "ok" ? "idle" : "stale"} />
              SHOW {feed.short}
            </button>
          {/each}
        </div>
      {/if}
    </span>
    {#if elsewhere}<Chip kind="nominal" text={elsewhere} />{/if}
  </span>
</div>
