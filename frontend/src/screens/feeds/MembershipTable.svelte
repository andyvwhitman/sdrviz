<script lang="ts">
  /** Channel x bank membership: one checkbox per channel and bank, two columns of 24 px rows. */
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import * as fmt from "$lib/hud/fmt";
  import type { GlyphState } from "$lib/hud/tile";
  import type { Channel, Feed } from "$lib/types/live";
  import { catalogue } from "./catalogue.svelte";
  import { bankAbbr } from "./look";
  import { membershipColumns, type Column } from "./membership";
  import type { BankRecord } from "./types";

  interface Props {
    channels: Channel[];
    feeds: Feed[];
    banks: BankRecord[];
    /** channel ids on air now */
    keyed: Set<string>;
    onerror: (message: string) => void;
  }
  let { channels, feeds, banks, keyed, onerror }: Props = $props();

  const CONFIDENCE: Record<string, string> = { high: "HIGH", med: "MED", medium: "MED", low: "LOW" };

  const bankedIds = $derived(new Set(banks.flatMap((b) => b.frequency_ids)));
  const columns = $derived(membershipColumns(channels, bankedIds, feeds));

  const unheard = (c: Channel): boolean => !c.monitored || c.coverage.state === "offline";
  const glyphFor = (c: Channel): GlyphState => (keyed.has(c.id) ? "tx" : unheard(c) ? "offline" : c.coverage.state === "stale" ? "stale" : "idle");

  async function setMember(bank: BankRecord, channel: Channel, member: boolean): Promise<void> {
    try {
      await catalogue.setMember(bank, channel.id, member);
    } catch (error) {
      onerror(error instanceof Error ? error.message : "Could not change the bank");
    }
  }
  const press = (event: KeyboardEvent, action: () => void): void => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      action();
    }
  };
</script>

{#snippet head()}
  <div class="fb-tr is-head">
    <span></span><span>CH</span><span>MHz</span><span></span><span>CHANNEL</span><span>CONF</span>
    <span class="fb-bk">{#each banks as b (b.id)}<span>{bankAbbr(b)}</span>{/each}</span>
  </div>
{/snippet}

{#snippet row(c: Channel)}
  {@const freq = catalogue.frequency(c.id)}
  {@const tx = keyed.has(c.id)}
  <div class="fb-tr" class:is-tx={tx} class:has-wash={tx} class:is-off={unheard(c) && !tx} data-id={c.id}>
    <PositionGlyph state={glyphFor(c)} />
    <span class="ch">{c.aar}</span><span class="mhz">{fmt.freq(c.freq_mhz)}</span><span></span><span class="lbl">{c.label}</span>
    <a class="conf" href={freq?.sources?.[0] ?? "#"} target="_blank" rel="noopener" title="Source">
      {CONFIDENCE[freq?.confidence ?? ""] ?? fmt.BLANK}<svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"><path class="ln" d="M3.5 0.5H8.5V5.5M8.5 0.5L3 6M6.5 8.5H0.5V2.5" /></svg>
    </a>
    <span class="fb-bk">
      {#each banks as b (b.id)}
        {@const member = b.frequency_ids.includes(c.id)}
        <span
          class="check"
          role="checkbox"
          tabindex="0"
          aria-checked={member}
          aria-label={b.name}
          onclick={() => setMember(b, c, !member)}
          onkeydown={(e) => press(e, () => setMember(b, c, !member))}><i></i></span>
      {/each}
    </span>
  </div>
{/snippet}

{#snippet column(col: Column)}
  <div class="fb-tbl">
    {@render head()}
    {#each col.items as item}
      {#if item.kind === "row"}
        {@render row(item.channel)}
      {:else if item.kind === "note"}
        <div class="fb-tr is-note"><span><span>SAME FREQ · DIFFERENT FEEDS</span><span class="mono">{item.text}</span></span></div>
      {:else}
        <div class="fb-tr is-grp"><span>UNBANKED<span class="mono">{item.count} · MONITORED IN NO BANK</span></span></div>
      {/if}
    {/each}
    <!-- M12 dimension bracket: extension lines from the MHz values, 4 px tick ends, leader to the note -->
    {#each col.brackets as b}
      <svg class="fb-dim" style="left:0;top:0" width="160" height={b.yNote + 12}>
        <path class="ext" d="M120 {b.y1 + 0.5}H130.5M120 {b.y2 + 0.5}H130.5" />
        <path d="M130.5 {b.y1}V{b.y2}M126.5 {b.y1 + 0.5}h8M126.5 {b.y2 + 0.5}h8M130.5 {b.y2}V{b.yNote + 0.5}h6" />
      </svg>
    {/each}
  </div>
{/snippet}

<div class="fb-tables" style="--banks:{banks.length}">
  {@render column(columns[0])}
  {@render column(columns[1])}
</div>
