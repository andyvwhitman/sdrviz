<script lang="ts">
  /**
   * Inspector panel (spec 5.26): docked over the pane column on Live Ops, exactly its width, never pushes.
   * Head: glyph, title, SIM and ESC. `lead` is the block under the
   * kind line; sections go in the default slot as `InspectorSection`s.
   */
  import type { Snippet } from "svelte";
  import Chip from "$lib/components/Chip.svelte";
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import SimTag from "$lib/components/SimTag.svelte";
  import type { GlyphState } from "$lib/hud/tile";

  interface Props {
    title: string;
    kind: string;
    glyph?: GlyphState;
    sim?: boolean;
    lead?: Snippet;
    children: Snippet;
    onclose: () => void;
  }
  let { title, kind, glyph, sim = false, lead, children, onclose }: Props = $props();
</script>

<svelte:window onkeydown={(event) => event.key === "Escape" && onclose()} />

<aside class="inspector br lo-insp" aria-label="Inspector">
  <div class="inspector__head">
    {#if glyph}<PositionGlyph state={glyph} />{/if}
    <span class="t-panel">{title}</span>
    {#if sim}<SimTag />{/if}
    <Chip button kind="nominal" text="ESC" onclick={onclose} />
  </div>
  <div class="inspector__kind">{kind}</div>
  {@render lead?.()}
  {@render children()}
</aside>
