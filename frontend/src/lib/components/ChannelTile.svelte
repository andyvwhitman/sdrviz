<script lang="ts">
  /**
   * Channel tile (spec 5.5-5.7): standard 200 x 112, compact 200 x 56, strip 384 x 28.
   * State comes from resolveTile; this component only draws it. Ported from HUD.c.tile.
   */
  import type { Snippet } from "svelte";
  import * as fmt from "$lib/hud/fmt";
  import { resolveTile, type TileIdentity, type TileInput, type TileVariant } from "$lib/hud/tile";
  import CoveragePips from "./CoveragePips.svelte";
  import LeverRow from "./LeverRow.svelte";
  import LevelMeter from "./LevelMeter.svelte";
  import PositionGlyph from "./PositionGlyph.svelte";
  import Sparkline from "./Sparkline.svelte";

  interface Props {
    identity: TileIdentity;
    state: TileInput;
    variant?: TileVariant;
    /** M15 waveform for the standard keyed tile's freed band */
    wave?: Snippet;
    onselect?: () => void;
    onlever?: (key: "m" | "s" | "r") => void;
  }
  let { identity, state: s, variant = "standard", wave, onselect, onlever }: Props = $props();

  const resolved = $derived(resolveTile(s, identity));
  const coverage = $derived(s.coverage ?? "ok");
  const blanked = $derived(coverage === "offline");
  const partial = $derived(coverage === "partial" && !!s.feeds);

  const aarText = $derived(variant === "strip" ? fmt.ch(identity.aar) : fmt.aar(identity.aar));
  const frameExtra = $derived({
    commit: s.commit ? "" : undefined,
    onset: s.fault?.onset && !s.fault.acked ? "" : undefined,
  });

  /* M16: no bar while the squelch is closed; no floor on an offline tile */
  const meter = $derived({
    w: variant === "compact" ? 64 : 120,
    tx: !!s.tx,
    muted: !!s.muted,
    floor: blanked ? null : (s.meter?.floor ?? null),
    db: s.tx || s.squelch ? (s.meter?.db ?? null) : null,
    peak: s.tx || s.squelch ? (s.meter?.peak ?? null) : null,
  });

  /* footer text (standard only) */
  const railroad = $derived(identity.railroad.toUpperCase());
  const showVia = $derived(!!s.via && (s.tx || !!resolved.ember));
  const hasTags = $derived(partial || s.muted || s.solo);

  /* size the ember underline to the label once fonts have loaded */
  let labelEl = $state<HTMLElement>();
  let emberWidth = $state(56);
  $effect(() => {
    void identity.label;
    if (!labelEl) return;
    const measure = () => labelEl && (emberWidth = Math.min(labelEl.scrollWidth, labelEl.clientWidth || labelEl.scrollWidth));
    measure();
    document.fonts?.ready.then(measure);
  });

  const flag = (on: boolean | undefined) => (on ? "" : undefined);

  function keydown(event: KeyboardEvent) {
    if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onselect?.();
    }
  }
</script>

<div
  class="tile tile--{variant}"
  class:has-wash={resolved.wash}
  role="button"
  tabindex="0"
  aria-label={resolved.aria}
  data-frame={resolved.frame}
  data-tx={flag(s.tx)}
  data-ember={resolved.ember ?? undefined}
  data-coverage={coverage}
  data-fault={s.fault ? (s.fault.acked ? "acked" : "unacked") : undefined}
  data-selected={flag(s.selected)}
  data-muted={flag(s.muted)}
  data-solo={flag(s.solo)}
  data-levers={flag(s.showLevers)}
  data-focused={flag(s.focused)}
  style:--ember-w="{emberWidth}px"
  onclick={onselect}
  onkeydown={keydown}
>
  <span class="frame" data-frame={resolved.frame} data-commit={frameExtra.commit} data-onset={frameExtra.onset}></span>
  <span class="sel"></span>
  <PositionGlyph state={resolved.glyph} class="tile__glyph" />
  <span class="tile__label" bind:this={labelEl}>{identity.label}</span>
  <span class="tile__ember"></span>
  <span class="tile__status {resolved.status.cls}">{resolved.status.text}</span>
  {#if variant !== "standard" && partial}
    <CoveragePips feeds={s.feeds!} class="tile__pips2" withCount={false} />
  {/if}
  <span class="tile__aar">{aarText}{#if identity.suffix}<small>{identity.suffix}</small>{/if}</span>
  {#if variant !== "standard" && resolved.reason}
    <span class="tile__reason">{resolved.reason}</span>
  {/if}
  <span class="tile__mhz">{blanked ? fmt.BLANK : fmt.freq(identity.mhz)}</span>
  {#if variant === "standard"}
    <span class="tile__spark">{#if !blanked}<Sparkline values={s.spark ?? []} live={!!s.tx} />{/if}</span>
  {/if}
  <span class="tile__timer">{fmt.dur(s.elapsed ?? 0)}</span>
  {#if variant !== "strip"}
    <span class="tile__meter"><LevelMeter {...meter} /></span>
    <span class="tile__levers"><LeverRow state={s.levers ?? { m: s.muted, s: s.solo }} ontoggle={onlever} /></span>
  {/if}
  {#if variant === "standard" && wave}
    <span class="tile__wave">{@render wave()}</span>
  {/if}
  {#if variant === "standard"}
    <span class="tile__foot">
      <span class="grow">
        {#if resolved.reason}
          <span class="is-fault">{resolved.reason}</span>
        {:else if showVia && hasTags}
          VIA {s.via}
        {:else if showVia}
          {railroad}<span class="sep"></span>VIA {s.via}
        {:else if hasTags}
          {railroad}
        {:else}
          {railroad}{#if identity.use}<span class="sep"></span>{identity.use.toUpperCase()}{/if}
        {/if}
      </span>
      {#if s.muted}<span class="tag-muted">MUTED</span>{/if}
      {#if s.solo}<span class="tag-solo">SOLO</span>{/if}
      {#if partial}<CoveragePips feeds={s.feeds!} class="tile__pips" />{/if}
    </span>
  {/if}
</div>
