<script lang="ts">
  /** The frequency catalogue: every channel the system knows, one row each (add and edit below). */
  import Button from "$lib/components/Button.svelte";
  import { session } from "$lib/stores/session.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { followLink } from "$lib/router.svelte";
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
    <div class="fb-cat__line">
      <button class="fb-tr fb-cat__row" class:is-picked={f.id === selectedId} disabled={!session.isAdmin} onclick={() => onselect(f.id)}>
        <span></span>
        <span class="ch">CH{String(f.aar_channel).padStart(2, "0")}</span><span class="mhz">{fmt.freq(f.freq_mhz)}</span><span></span>
        <span class="lbl">{f.label}</span><span class="use">{f.railroad} · {f.use}</span><span class="mhz">{memberOf(f.id)}</span>
      </button>
      <!-- a sibling of the row button: an anchor cannot sit inside a button -->
      <a class="fb-cat__open" href="/frequency/{f.id}" onclick={followLink} title="Open the {f.label} frequency page" aria-label="Open the {f.label} frequency page">›</a>
    </div>
  {/each}
</div>
{#if session.isAdmin}<div class="fb-cat__add"><Button sm onclick={onadd}>+ ADD FREQUENCY</Button></div>{/if}

<style>
  .fb-cat__line { display: flex; align-items: center; }
  .fb-cat__line .fb-cat__row { flex: 1; min-width: 0; }
  .fb-cat__open { flex: none; width: 28px; height: 24px; display: grid; place-items: center; border: 0; border-bottom: 1px solid var(--grid); color: var(--ink-2); font: 400 var(--fs-18)/1 var(--font-label); }
  .fb-cat__open:hover { color: var(--ink); }
</style>
