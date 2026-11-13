<script lang="ts">
  /**
   * /kit: the shared components on live data (dev only, not in the nav). Reference for the screen
   * packages and a visual check against design/mockups/components.html.
   */
  import ChannelTile from "$lib/components/ChannelTile.svelte";
  import Chip from "$lib/components/Chip.svelte";
  import DataBlock from "$lib/components/DataBlock.svelte";
  import DataBlockSvg from "$lib/components/DataBlockSvg.svelte";
  import KeyValue from "$lib/components/KeyValue.svelte";
  import LevelMeter from "$lib/components/LevelMeter.svelte";
  import MilepostTag from "$lib/components/MilepostTag.svelte";
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import Sparkline from "$lib/components/Sparkline.svelte";
  import Tabs from "$lib/components/Tabs.svelte";
  import TileGrid from "$lib/components/TileGrid.svelte";
  import TranscriptRow from "$lib/components/TranscriptRow.svelte";
  import { blockGeometry } from "$lib/hud/dataBlock";
  import { feedName } from "$lib/hud/roles";
  import { identityFrom, sharedFrequencySuffix, tileInputFrom, type TileVariant } from "$lib/hud/tile";
  import { live } from "$lib/stores/live.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import type { GlyphState } from "$lib/hud/tile";

  shell.scope = ["KIT", "COMPONENTS"];

  const snapshot = $derived(live.state);
  const feeds = $derived(Object.fromEntries((snapshot?.feeds ?? []).map((f) => [f.id, f])));
  const bank = $derived(snapshot ? snapshot.views[snapshot.active_bank] : null);
  const channels = $derived(snapshot ? bank!.tile_ids.map((id) => snapshot.channels.find((c) => c.id === id)!) : []);

  let variant = $state<TileVariant>("standard");
  const cols = $derived(variant === "standard" ? 5 : variant === "compact" ? 3 : 2);

  const glyphs: GlyphState[] = ["idle", "squelch", "tx", "stale", "offline", "fault", "fault-past"];
  const block = blockGeometry({ x: 60, y: 60, dir: "ne", l1: "MARC 410", l2: "NEC 113.6 · CH54", sim: true });
</script>

<div class="kit">
  <section>
    <h4 class="t-label">TILES ({variant})</h4>
    <Tabs
      items={[{ id: "standard", name: "Standard" }, { id: "compact", name: "Compact" }, { id: "strip", name: "Strip" }]}
      selected={variant}
      onselect={(id) => (variant = id as TileVariant)}
    />
    {#if snapshot}
      <TileGrid {cols}>
        {#each channels as c (c.id)}
          <ChannelTile
            {variant}
            identity={identityFrom(c, sharedFrequencySuffix(c, snapshot.channels, feedName))}
            state={tileInputFrom(c, { feeds, displayedFeed: snapshot.displayed_feed })}
          />
        {/each}
      </TileGrid>
    {/if}
  </section>

  <section>
    <h4 class="t-label">GLYPHS · CHIPS · METERS · SPARK</h4>
    <div class="row">
      {#each glyphs as g}<PositionGlyph state={g} />{/each}
      <Chip text="FEEDS 4/4" />
      <Chip text="FEEDS 2/4" kind="fault" glyph="fault" />
      <Chip text="KEYED · CH54" kind="tx" glyph="tx" />
      <Chip text="AUDIO · CLICK TO ENABLE" kind="armed" button />
    </div>
    <div class="row">
      <LevelMeter db={-30} peak={-22} floor={-47} />
      <LevelMeter db={-18} peak={-12} floor={-47} tx />
      <LevelMeter na />
      <Sparkline values={[0, 3, 12, 0, 7, 30, 4, 0, 9, 2, 0, 0, 5]} live />
      <MilepostTag mp="NEC 113.6" />
      <MilepostTag mp="4.2" />
      <DataBlock l1="MARC 410" l2="NEC 113.6 · CH54" sim />
    </div>
    <div class="row">
      <svg class="hud" width="260" height="100" viewBox="0 0 260 100"><DataBlockSvg geometry={block} /></svg>
      <div class="kv-box">
        <KeyValue label="SAMPLE RATE" value="2.400" unit="MSPS" />
        <KeyValue label="DEVICE TEMP" na="RTL_TCP" meter={{}} />
      </div>
    </div>
  </section>

  {#if snapshot}
    <section>
      <h4 class="t-label">TRANSCRIPT ROWS</h4>
      <div class="txlog">
        {#each snapshot.transcript.rows.slice(0, 6) as row (row.id)}
          <TranscriptRow {row} live={row.live} />
        {/each}
      </div>
      <div class="txlog">
        {#each snapshot.transcript.rows.slice(6, 12) as row (row.id)}
          <TranscriptRow {row} columns="history" play />
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .kit {
    position: absolute;
    inset: 0;
    overflow: auto;
    display: grid;
    gap: 24px;
    align-content: start;
  }
  .row {
    display: flex;
    gap: 16px;
    align-items: center;
    margin: 12px 0;
    flex-wrap: wrap;
  }
  .kv-box {
    width: 320px;
  }
  section :global(.tile-grid) {
    margin-top: 12px;
  }
</style>
