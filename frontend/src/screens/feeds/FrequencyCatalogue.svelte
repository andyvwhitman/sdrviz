<script lang="ts">
  /** The frequency catalogue: every channel the system knows, one row each (add and edit below). */
  import Button from "$lib/components/Button.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { catalogue } from "./catalogue.svelte";

  interface Props {
    selectedId: string | null;
    onselect: (id: string) => void;
    onadd: () => void;
  }
  let { selectedId, onselect, onadd }: Props = $props();

  const rows = $derived([...catalogue.frequencies].sort((a, b) => a.aar_channel - b.aar_channel || a.id.localeCompare(b.id)));
  const memberOf = (id: string): number => catalogue.banks.filter((b) => b.frequency_ids.includes(id)).length;
</script>

<div class="fb-cat">
  <div class="fb-tr is-head">
    <span></span><span>CH</span><span>MHz</span><span></span><span>CHANNEL</span><span>RAILROAD · USE</span><span>BANKS</span>
  </div>
  {#each rows as f (f.id)}
    <button class="fb-tr fb-cat__row" class:is-picked={f.id === selectedId} onclick={() => onselect(f.id)}>
      <span></span>
      <span class="ch">CH{String(f.aar_channel).padStart(2, "0")}</span><span class="mhz">{fmt.freq(f.freq_mhz)}</span><span></span>
      <span class="lbl">{f.label}</span><span class="use">{f.railroad} · {f.use}</span><span class="mhz">{memberOf(f.id)}</span>
    </button>
  {/each}
</div>
<div class="fb-cat__add"><Button sm onclick={onadd}>+ ADD FREQUENCY</Button></div>
