<script lang="ts">
  /**
   * Hero strip (spec 5.27, brief 9.1.1): what is keyed now, or how long ago the listened node last heard anything,
   * then the "on another node" readout and the node's state chip, which opens the feed inspector.
   */
  import Chip from "$lib/components/Chip.svelte";
  import type { ChipKind } from "$lib/hud/chips";
  import * as fmt from "$lib/hud/fmt";
  import { session } from "$lib/stores/session.svelte";
  import type { Fault, Feed } from "$lib/types/live";
  import type { Hero } from "./hero";

  interface Props {
    hero: Hero;
    displayed: Feed;
    faults: readonly Fault[];
    elsewhere: { text: string; feedId: string } | null;
    /** a keyed channel's name was chosen: select it into the pane */
    onselect?: (frequencyId: string) => void;
    /** an admin chose the "+1 ON SDR-02" readout: listen to that node */
    onshowfeed: (feedId: string) => void;
    oninspectfeed: (feedId: string) => void;
  }
  let { hero, displayed, faults, elsewhere, onselect, onshowfeed, oninspectfeed }: Props = $props();

  const fault = $derived(faults.find((f) => f.object === displayed.id));
  const selectorKind = $derived<ChipKind>(fault ? (fault.acked ? "acked" : "fault") : displayed.state === "stale" ? "degraded" : "active");
</script>

<div class="hero lo-hero">
  {#if hero.mode === "keyed"}
    <button class="lo-herosel" type="button" title="Select {hero.label}" onclick={() => onselect?.(hero.id)}>
      <span class="hero__big is-tx">{hero.aar4}</span>
      <span class="hero__stack"><span class="a">{hero.label}</span><span class="b">KEYED · VIA {hero.via}</span></span>
    </button>
    <span class="hero__big is-tx">{fmt.dur(hero.elapsedS)}</span>
    {#if hero.others.length}
      <span class="hero__list">+{hero.others.length}{#each hero.others as other (other.id)}{" · "}<button class="lo-herolink" type="button" title="Select {other.aar4}" onclick={() => onselect?.(other.id)}>{other.aar4}</button>{/each}</span>
    {/if}
  {:else if hero.mode === "idle"}
    <span class="hero__text c-ink-2">LAST KEY-UP</span>
    <span class="hero__big is-2">{fmt.age(hero.ageS)}</span>
    <span class="hero__text c-ink-2">AGO · {hero.aar} · {hero.label}</span>
  {:else if hero.mode === "empty"}
    <span class="hero__text c-ink-2">NOTHING ENABLED</span>
  {:else}
    <span class="hero__text c-ink-2">NO KEY-UPS YET</span>
  {/if}

  <span class="hero__aside">
    <Chip button kind={selectorKind} glyph={fault ? "fault" : undefined} text="FEED · {displayed.short}" title="Inspect {displayed.short}" onclick={() => oninspectfeed(displayed.id)} />
    {#if elsewhere}
      {#if session.isAdmin}
        <Chip button kind="nominal" text={elsewhere.text} title="Listen to {elsewhere.text.replace(/^.* ON /, '')}" onclick={() => onshowfeed(elsewhere.feedId)} />
      {:else}
        <Chip kind="nominal" text={elsewhere.text} />
      {/if}
    {/if}
  </span>
</div>
