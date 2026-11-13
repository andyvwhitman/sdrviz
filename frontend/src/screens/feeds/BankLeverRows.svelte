<script lang="ts">
  /** One row per bank: name, home feed, one M21 mute lever per channel, and the bank's coverage notes. */
  import BankLever from "$lib/components/BankLever.svelte";
  import Chip from "$lib/components/Chip.svelte";
  import SimTag from "$lib/components/SimTag.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { feedName } from "$lib/hud/roles";
  import { prefs } from "$lib/stores/prefs.svelte";
  import type { Channel } from "$lib/types/live";
  import { bankAbbr, channelNumber } from "./look";
  import type { BankRecord } from "./types";

  interface Props {
    banks: BankRecord[];
    channels: Map<string, Channel>;
    keyed: Set<string>;
    activeId: string;
    selectedId: string | null;
    onselect: (id: string) => void;
  }
  let { banks, channels, keyed, activeId, selectedId, onselect }: Props = $props();

  /** Live Ops tile capacity per stage size (spec 4.3) */
  const CAPACITY = { standard: 20, compact: 15 };

  const status = (c: Channel): "tx" | "stale" | "off" | undefined => {
    if (keyed.has(c.id)) return "tx";
    if (!c.monitored || c.coverage.state === "offline") return "off";
    return c.coverage.state === "stale" ? "stale" : undefined;
  };

  function summary(bank: BankRecord) {
    const members = bank.frequency_ids.flatMap((id) => channels.get(id) ?? []);
    const count = (predicate: (c: Channel) => boolean): number => members.filter(predicate).length;
    return {
      levers: members.sort((a, b) => channelNumber(a) - channelNumber(b)),
      notHeard: count((c) => !c.monitored),
      stale: count((c) => c.monitored && c.coverage.state === "stale"),
      noFeeds: count((c) => c.monitored && c.coverage.state === "offline"),
    };
  }
</script>

{#each banks as bank (bank.id)}
  {@const s = summary(bank)}
  <div class="fb-bank" class:is-selected={bank.id === selectedId}>
    <div class="fb-bank__meta">
      <button class="fb-bank__name" aria-label="Edit bank {bank.name}" onclick={() => onselect(bank.id)}>
        <span class="mono">{bankAbbr(bank)}</span>{bank.name}{#if bank.sim}<SimTag />{/if}
      </button>
      <span class="fb-bank__sub">{bank.frequency_ids.length} <span class="label">CH · HOME</span> {feedName(bank.home_feed)}</span>
    </div>
    <div class="fb-bank__levers">
      {#each s.levers as c (c.id)}
        <BankLever letter="M" on={prefs.muted.has(c.id)} aar={fmt.aar(channelNumber(c)).slice(0, 2)} status={status(c)} label="Mute {c.aar} {c.label}" onclick={() => prefs.toggle("muted", c.id)} />
      {/each}
    </div>
    <div class="fb-bank__note">
      {#if bank.id === activeId}<Chip kind="active" text="LIVE OPS" />{/if}
      <div>
        {#if s.stale}<span style="color:var(--state-stale)"><span class="mono">{s.stale}</span> STALE</span>{/if}
        {#if s.stale && (s.noFeeds || s.notHeard)}<span class="sep"></span>{/if}
        {#if s.noFeeds}<span class="mono">{s.noFeeds}</span> NO FEEDS{/if}
        {#if s.noFeeds && s.notHeard}<span class="sep"></span>{/if}
        {#if s.notHeard}<span class="is-dim"><span class="mono">{s.notHeard}</span> NOT HEARD</span>{/if}
        {#if bank.frequency_ids.length > CAPACITY.standard}EXCEEDS LIVE OPS STANDARD CAPACITY AT 1920 × 1080 ({CAPACITY.standard}){:else if bank.frequency_ids.length > CAPACITY.compact}EXCEEDS LIVE OPS COMPACT CAPACITY AT 1440 × 900 ({CAPACITY.compact}){/if}
      </div>
    </div>
  </div>
{/each}
