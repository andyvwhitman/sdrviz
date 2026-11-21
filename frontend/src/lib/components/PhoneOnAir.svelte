<script lang="ts">
  /**
   * What is on the air, for a phone: a fixed strip above the status line with at most two transmissions
   * (channel, train, running timer). Fixed, so nothing reflows when it appears; nothing renders when the air is quiet.
   */
  import { onMount } from "svelte";
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { live } from "$lib/stores/live.svelte";
  import { simClock } from "$lib/stores/simClock.svelte";
  import { keyAge } from "$lib/time";
  import type { TxRow } from "$lib/types/live";

  const MAX_ROWS = 2;

  onMount(() => simClock.start());

  const rows = $derived(live.state?.active_transmissions ?? []);
  const shown = $derived(rows.slice(0, MAX_ROWS));
  const more = $derived(rows.length - shown.length);
  const elapsed = (t: TxRow): number => (live.simSpeed === 0 ? (t.elapsed_s ?? 0) : keyAge(simClock.now, t.t_offset_s));
</script>

{#if shown.length}
  <div class="oa" aria-label="On air">
    {#each shown as t (t.id)}
      <div class="oa__row">
        <PositionGlyph state="tx" />
        <span class="oa__ch">{t.aar}</span>
        <span class="oa__who">{fmt.trainId(t.train_id ?? t.speaker)}</span>
        <span class="oa__tm">{fmt.dur(elapsed(t))}</span>
      </div>
    {/each}
    {#if more > 0}<div class="oa__more">+{more} MORE</div>{/if}
  </div>
{/if}

<style>
  .oa {
    position: fixed; left: 12px; right: 12px; bottom: calc(var(--status-h) + 12px); z-index: 15; display: grid; gap: 4px;
    padding: 8px 0 4px; background: var(--bg-void); border-top: 1px solid var(--line-faint); pointer-events: none;
  }
  .oa__row { display: grid; grid-template-columns: 18px 56px 1fr auto; align-items: center; column-gap: 8px; font: 400 var(--fs-15)/1.2 var(--font-data); color: var(--state-tx); white-space: nowrap; }
  .oa__ch { font-weight: 500; }
  .oa__who { overflow: hidden; text-overflow: ellipsis; }
  .oa__tm { font-weight: 500; }
  .oa__more { font: 500 var(--fs-13)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); }
</style>
