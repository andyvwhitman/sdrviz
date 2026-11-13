<script lang="ts">
  /**
   * Inspector panel (spec 5.26): 480 px, docked right over the log, never pushes. Head: glyph, title,
   * SIM, `LOG +n` (rows that arrived in the log underneath) and ESC. `lead` is the block under the
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
    /** new log rows since the inspector opened */
    logCount?: number;
    lead?: Snippet;
    children: Snippet;
    onclose: () => void;
  }
  let { title, kind, glyph, sim = false, logCount = 0, lead, children, onclose }: Props = $props();
</script>

<svelte:window onkeydown={(event) => event.key === "Escape" && onclose()} />

<aside class="inspector br lo-insp" aria-label="Inspector">
  <div class="inspector__head">
    {#if glyph}<PositionGlyph state={glyph} />{/if}
    <span class="t-panel">{title}</span>
    {#if sim}<SimTag />{/if}
    {#if logCount > 0}<Chip kind="active" text="LOG +{logCount}" />{/if}
    <Chip button kind="nominal" text="ESC" onclick={onclose} />
  </div>
  <div class="inspector__kind">{kind}</div>
  {@render lead?.()}
  {@render children()}
</aside>
