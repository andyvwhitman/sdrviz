<script lang="ts">
  /**
   * The phone's spectrum view (direction 9.3): the front wall as a view-only instrument filling the screen, in portrait
   * or landscape. No click-to-listen, no feed switching, no levers; a touch held on a plot reads the cursor. It uses the
   * same plots as the desktop wall, sized to the layer by the same rules.
   */
  import AudioToggle from "$lib/components/AudioToggle.svelte";
  import Glyph from "$lib/components/Glyph.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { ui } from "$lib/stores/ui.svelte";
  import { parseUtcOffset } from "$lib/time";
  import type { Feed, LiveState } from "$lib/types/live";
  import FrontWall from "./FrontWall.svelte";
  import { REF_DBFS } from "./wall";

  interface Props {
    state: LiveState;
    listedChannels: number[];
    dropAge: number | null;
    feed: Feed;
    onback: () => void;
  }
  let { state: snapshot, listedChannels, dropAge, feed, onback }: Props = $props();

  const zone = $derived(snapshot.tz.name ?? "EST");
  const clock = $derived(fmt.clock(snapshot.clock, ui.utc ? "UTC" : zone, -parseUtcOffset(snapshot.tz.utc_offset)).slice(0, 8));
</script>

<div class="sv" role="region" aria-label="Spectrum">
  <div class="sv__bar">
    <button class="sv__back" type="button" onclick={onback}><Glyph name="chevron-left" size={12} />LIVE OPS</button>
    <span class="sv__feed">FEED <b>{feed.short}</b></span>
    <span class="sv__grow"></span>
    <span class="sv__clock">{clock}</span>
  </div>
  <div class="sv__plot">
    <FrontWall viewOnly state={snapshot} {listedChannels} {dropAge} {feed} />
  </div>
  <div class="sv__foot">
    <span>REF <b>{fmt.num(REF_DBFS, 0)}</b> dBFS · <b>10</b> dB/div</span>
    <AudioToggle />
  </div>
</div>

<style>
  .sv {
    position: fixed; inset: 0; z-index: 30; display: flex; flex-direction: column; background: var(--bg-void);
    padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right);
    --spectrum-h: 120px;
  }
  .sv__bar { flex: none; height: 44px; display: flex; align-items: center; gap: 12px; padding: 0 8px; border-bottom: 1px solid var(--grid); font: 500 var(--fs-13)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); }
  .sv__back { display: inline-flex; align-items: center; gap: 6px; height: 44px; padding: 0 8px; color: var(--ink-2); font: inherit; letter-spacing: inherit; }
  .sv__back:hover { color: var(--ink); }
  .sv__feed b { font-weight: 500; color: var(--ink); }
  .sv__grow { flex: 1; }
  .sv__clock { font: 400 var(--fs-13)/1 var(--font-data); color: var(--ink); }
  .sv__plot { flex: 1; min-height: 0; padding: 8px 8px 0; }
  .sv__foot { flex: none; height: 28px; display: flex; align-items: center; justify-content: space-between; padding: 0 8px 0 12px; font: 400 var(--fs-11)/1 var(--font-data); color: var(--ink-3); }
  .sv__foot b { font-weight: 400; color: var(--ink-2); }

  /* landscape phone: a 32 px bar, a 56 px spectrum, no status line; the corner mute floats at the bottom right */
  @media (max-height: 559px) {
    .sv { --spectrum-h: 56px; }
    .sv__bar, .sv__back { height: 32px; }
    .sv__plot { padding-top: 0; padding-bottom: 0; }
    .sv__foot { position: absolute; right: calc(8px + env(safe-area-inset-right)); bottom: 8px; height: auto; padding: 0; }
    .sv__foot span { display: none; }
  }
</style>
