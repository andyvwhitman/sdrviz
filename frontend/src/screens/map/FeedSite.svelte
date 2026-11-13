<svelte:options namespace="svg" />
<script lang="ts">
  /** A feed site: registration mark, selection bracket and its data block. */
  import DataBlockSvg from "$lib/components/DataBlockSvg.svelte";
  import type { GlyphState } from "$lib/hud/tile";
  import RegMark from "./RegMark.svelte";
  import SelectBracket from "./SelectBracket.svelte";
  import type { BlockGeometry } from "$lib/hud/dataBlock";
  import type { FeedLook } from "./lib/inputs";

  interface Props {
    x: number;
    y: number;
    look: FeedLook;
    selected: boolean;
    /** null while the schematic morph has taken the block away */
    block: BlockGeometry | null;
    onselect: () => void;
  }
  let { x, y, look, selected, block, onselect }: Props = $props();
  const dim = $derived(look.glyph === "idle-dim");
</script>

<g class="mp-hit" role="button" tabindex="-1" onclick={onselect} onkeydown={(e) => e.key === "Enter" && onselect()}>
  <RegMark {x} {y} state={look.mark} />
  {#if selected}<SelectBracket x={Math.round(x)} y={Math.round(y)} o={16} />{/if}
  {#if block}
    <g class:mp-dim={dim}>
      <DataBlockSvg geometry={{ ...block, glyph: dim ? "idle" : (look.glyph as GlyphState) }} />
    </g>
  {/if}
</g>
