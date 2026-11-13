<script lang="ts">
  /** Bracketed chip (spec 5.20). Renders a <button> when `button` is set, else a <span>. */
  import type { Snippet } from "svelte";
  import type { ChipKind } from "$lib/hud/chips";
  import type { GlyphState } from "$lib/hud/tile";
  import PositionGlyph from "./PositionGlyph.svelte";

  interface Props {
    /** chip text; or pass children */
    text?: string;
    kind?: ChipKind;
    glyph?: GlyphState;
    /** fault onset pulse */
    onset?: boolean;
    button?: boolean;
    pressed?: boolean;
    class?: string;
    title?: string;
    onclick?: (event: MouseEvent) => void;
    children?: Snippet;
  }
  let { text, kind = "nominal", glyph, onset = false, button = false, pressed, class: className = "", title, onclick, children }: Props = $props();
</script>

{#snippet content()}
  {#if glyph}<PositionGlyph state={glyph} />{/if}{#if children}{@render children()}{:else}{text}{/if}
{/snippet}

{#if button}
  <button class="chip {className}" data-chip={kind} data-onset={onset ? "" : undefined} aria-pressed={pressed} {title} {onclick}>{@render content()}</button>
{:else}
  <span class="chip {className}" data-chip={kind} data-onset={onset ? "" : undefined} {title}>{@render content()}</span>
{/if}
