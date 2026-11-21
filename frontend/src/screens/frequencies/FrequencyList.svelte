<script lang="ts">
  /** The phone list (direction 2.6): 64 px two-line rows, the read-only ON cell on the right. */
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import { aar as aarPair, freq as mhzText } from "$lib/hud/fmt";
  import type { Frequency, NodeColumn } from "$lib/types/frequencies";
  import OnCell from "./OnCell.svelte";
  import { glyphOf } from "./table";

  interface Props {
    rows: Frequency[];
    columns: NodeColumn[];
    /** the node filter's feed id, or null for all nodes */
    node: string | null;
    keyed: Set<string>;
    onrow: (f: Frequency) => void;
  }
  let { rows, columns, node, keyed, onrow }: Props = $props();
</script>

<ul class="frl" aria-label="Frequencies">
  {#each rows as f (f.id)}
    {@const glyph = glyphOf(f, columns, keyed.has(f.id))}
    <li>
      <button class="frl__row" class:is-tx={keyed.has(f.id)} type="button" onclick={() => onrow(f)} id="fr-row-{f.id}">
        <span class="frl__l1">
          {#if glyph}<PositionGlyph state={glyph} />{:else}<span class="frl__noglyph"></span>{/if}
          <span class="frl__mhz">{mhzText(f.freq_mhz)}</span>
          <span class="frl__aar">{aarPair(f.aar_channel)}</span>
          <span class="frl__grow"></span>
          <span class="frl__on"><OnCell {f} {node} /></span>
        </span>
        <span class="frl__l2"><span class="frl__label">{f.label}</span><span class="frl__sub">{[f.railroad, f.use].filter(Boolean).join(" · ")}</span></span>
      </button>
    </li>
  {/each}
</ul>
