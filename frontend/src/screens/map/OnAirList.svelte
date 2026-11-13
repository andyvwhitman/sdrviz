<script lang="ts">
  /** ON AIR: every transmission on the air now, with the feed it came in through and its running timer. */
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { live } from "$lib/stores/live.svelte";
  import { simClock } from "$lib/stores/simClock.svelte";
  import { cyclicAge } from "$lib/time";
  import type { TxRow } from "$lib/types/live";

  interface Props {
    rows: TxRow[];
    /** motion study: ms since the squelch crossing; the replayed row shows its own clock */
    demoMs?: number | null;
    demoRow?: TxRow;
  }
  let { rows, demoMs = null, demoRow }: Props = $props();

  /** Running time on the sim clock (tenths); a frozen sim shows the snapshot's own value. */
  const elapsed = (t: TxRow): number => (live.simSpeed === 0 ? (t.elapsed_s ?? 0) : Math.max(0, cyclicAge(simClock.now, t.t_offset_s)));

  const visible = $derived(rows.filter((t) => !(demoMs !== null && t === demoRow && demoMs < 0)));
</script>

{#if visible.length}
  <div class="mp-onair__head">ON AIR · {visible.length}</div>
  {#each visible as t (t.id)}
    {@const demo = demoMs !== null && t === demoRow}
    <div class="mp-onair__row">
      <PositionGlyph state={demo && demoMs! < 250 ? "squelch" : "tx"} />
      <span class="ch">{t.aar}</span>
      <span class="who">{fmt.trainId(t.train_id ?? t.speaker)}</span>
      <span class="via">VIA {t.feed_label}</span>
      <span class="tm">{fmt.dur(demo ? Math.max(0, demoMs!) / 1000 : elapsed(t))}</span>
    </div>
  {/each}
{/if}
