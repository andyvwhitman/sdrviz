<script lang="ts">
  /**
   * Live Ops (spec 4.3, brief 9.1): hero strip, front wall, bank tabs and tile wall, transcript log,
   * CTC strip and the channel / feed inspectors. The system screens reuse this wall: `link` renders
   * it blank (loading, connecting), voided and AGE-stamped after a link drop (reconnecting), dimmed
   * under the NO LINK alarm, or with an empty bank (spec 11.17).
   */
  import { onMount, untrack } from "svelte";
  import { api, type Json } from "$lib/api/client";
  import ChannelTile from "$lib/components/ChannelTile.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import TileGrid from "$lib/components/TileGrid.svelte";
  import Waveform from "$lib/components/Waveform.svelte";
  import { BLANK } from "$lib/hud/fmt";
  import { feedName } from "$lib/hud/roles";
  import { identityFrom, sharedFrequencySuffix, tileInputFrom, type TileInput } from "$lib/hud/tile";
  import { params } from "$lib/params";
  import { router } from "$lib/router.svelte";
  import { cyclicAge } from "$lib/time";
  import { levels } from "$lib/stores/levels.svelte";
  import { link as linkStore } from "$lib/stores/link.svelte";
  import { live } from "$lib/stores/live.svelte";
  import { prefs } from "$lib/stores/prefs.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { simClock } from "$lib/stores/simClock.svelte";
  import type { Channel, Word } from "$lib/types/live";
  import { BACKOFF_S } from "$lib/ws/link";
  import BankTabs from "./BankTabs.svelte";
  import ChannelInspector from "./ChannelInspector.svelte";
  import type { RoutesDoc } from "./ctc/layout";
  import CtcStrip from "./CtcStrip.svelte";
  import FeedInspector from "./FeedInspector.svelte";
  import FrontWall from "./FrontWall.svelte";
  import { boxStyle, geometryFor } from "./geometry";
  import { elsewhereLabel, heroFor, offBankLabel } from "./hero";
  import HeroStrip from "./HeroStrip.svelte";
  import { KeyupMotion } from "./keyup.svelte";
  import { LEVER_LIST, type LeverKey } from "./mixer";
  
  import TranscriptLog from "./TranscriptLog.svelte";
  import type { LiveOpsLink } from "./types";
  import { waveEnvelope, WAVE_WIDTH } from "./wave";
  import { noiseFloor } from "./wall";
  import "./live-ops.css";

  interface Props {
    link?: LiveOpsLink;
  }
  let { link: forced }: Props = $props();

  const geometry = geometryFor(params.size);
  const snapshot = $derived(live.state);

  /* the link: the prop when a system screen forces a state, else what the socket is doing */
  const linkState = $derived<LiveOpsLink["state"] | null>(
    forced?.state ?? (linkStore.status === "reconnecting" || linkStore.status === "no-link" ? linkStore.status : null),
  );
  const dropAge = $derived(linkState === "reconnecting" || linkState === "no-link" ? (forced?.dropAge ?? linkStore.dropAgeS ?? 0) : null);
  const blank = $derived(!snapshot || linkState === "loading" || linkState === "connecting");

  /* ---- sim clock, key-up choreography */
  let tilesBox = $state<HTMLElement>();
  const motion = new KeyupMotion(
    (id) => tilesBox?.querySelectorAll(".tile")[tiles.findIndex((c) => c.id === id)],
    (channel) => {
      const row = snapshot?.transcript.rows.find((r) => r.id === channel.tx?.tx_id);
      const elapsed = row?.duration_s ?? channel.tx?.elapsed_s ?? 0;
      return { channel, elapsed, env: envelopeOf(channel, elapsed, row?.words) };
    },
  );
  onMount(() => simClock.start());
  $effect(() => {
    if (snapshot) simClock.sync(snapshot.t_offset_s);
  });
  $effect(() => {
    if (snapshot) motion.observe(snapshot.channels);
  });
  const now = $derived(dropAge != null && snapshot ? snapshot.t_offset_s : simClock.now);

  /* ---- the bank on the wall */
  const emptyForced = $derived(linkState === "empty-bank");
  const bank = $derived(forced?.bank ?? (snapshot ? (snapshot.banks.find((b) => b.id === snapshot.active_bank) ?? snapshot.banks[0]) : null));
  const bankList = $derived(snapshot ? (bank && !snapshot.banks.some((b) => b.id === bank.id) ? [...snapshot.banks, bank] : snapshot.banks) : []);
  const tileIds = $derived(emptyForced ? [] : (snapshot && bank ? (snapshot.views[bank.id]?.tile_ids ?? []) : []));
  const bankIds = $derived(new Set(emptyForced ? [] : (bank?.frequency_ids ?? [])));
  const channelById = $derived(new Map((snapshot?.channels ?? []).map((c) => [c.id, c])));
  const tiles = $derived(tileIds.flatMap((id) => (channelById.has(id) ? [channelById.get(id)!] : [])));
  const feedById = $derived(new Map((snapshot?.feeds ?? []).map((f) => [f.id, f])));
  const displayed = $derived(snapshot ? (feedById.get(snapshot.displayed_feed) ?? snapshot.feeds[0]) : null);
  const bankChannelNumbers = $derived(tiles.map((c) => Number(c.aar.replace(/\D/g, ""))));

  $effect(() => {
    shell.scope = bank ? ["BANK", bank.name.toUpperCase()] : ["BANK", BLANK];
  });

  /* ---- hero */
  const hero = $derived(
    snapshot ? heroFor({ channels: snapshot.channels, active: snapshot.active_transmissions, bankIds, now }) : ({ mode: "none" } as const),
  );
  const offBank = $derived(snapshot ? offBankLabel(snapshot.active_transmissions, bankIds) : null);
  const elsewhere = $derived(snapshot && displayed ? elsewhereLabel(snapshot.active_transmissions, displayed.id, feedName) : null);

  /* ---- selection and inspector (URL: select, inspect) */
  const inspectId = $derived(router.query("inspect"));
  const selectedId = $derived(router.query("select") ?? (inspectId && channelById.has(inspectId) ? inspectId : null));
  const inspectChannel = $derived(inspectId ? channelById.get(inspectId) : undefined);
  const inspectFeed = $derived(inspectId ? feedById.get(inspectId) : undefined);

  function selectChannel(id: string): void {
    if (selectedId === id && inspectId === id) router.setQuery({ select: null, inspect: null });
    else router.setQuery({ select: id, inspect: id });
  }
  const closeInspector = () => router.setQuery({ inspect: null });
  const showFeed = (feedId: string) => prefs.update({ displayed_feed: feedId }).catch((e) => console.warn("feed not changed", e));
  const inspectFeedId = (feedId: string) => router.setQuery({ inspect: feedId });

  /* LOG +n: rows that arrived in the log while the inspector covered it */
  let logBase = $state<string | null>(null);
  $effect(() => {
    const open = inspectId; // re-run when the inspector opens, changes or closes
    logBase = open ? untrack(() => live.state?.transcript.rows[0]?.id ?? null) : null;
  });
  const logCount = $derived.by(() => {
    if (!inspectId || !snapshot || logBase == null) return 0;
    const at = snapshot.transcript.rows.findIndex((r) => r.id === logBase);
    return at < 0 ? 0 : at;
  });

  /* ---- tiles */
  function tileState(c: Channel): TileInput {
    const held = motion.held.get(c.id); // just released: the tile still shows the keyed channel, frozen
    const base = tileInputFrom(held?.channel ?? c, {
      feeds: Object.fromEntries(feedById),
      displayedFeed: snapshot!.displayed_feed,
      selectedId,
      muted: prefs.muted,
      solo: prefs.solo,
      linkDropAgeS: dropAge,
    });
    base.levers = { m: prefs.muted.has(c.id), s: prefs.solo.has(c.id), r: prefs.record.has(c.id) };
    base.commit = motion.committing.has(c.id) && !prefs.muted.has(c.id);
    if (held) base.elapsed = held.elapsed;
    else if (dropAge == null) {
      const active = c.tx ? snapshot!.active_transmissions.find((row) => row.id === c.tx!.tx_id) : undefined;
      if (active) base.elapsed = Math.max(0, cyclicAge(now, active.t_offset_s));
      if (c.last_heard && !c.tx) base.lastS = cyclicAge(now, c.last_heard.end_t);
      const level = levels.last[c.id];
      if (level && (c.tx || c.state === "squelch")) base.meter = { ...base.meter, db: level.db, peak: level.peak };
    }
    return base;
  }

  /** M15 envelope of a keyed channel: its word timings or the 10 Hz level stream, `elapsed` seconds in */
  function envelopeOf(c: Channel, elapsed: number, words?: Word[]) {
    void levels.version;
    const feed = feedById.get(c.tx?.primary_feed ?? c.heard_by[0]) ?? displayed!;
    return waveEnvelope(levels.envelope(c.id), noiseFloor(feed), elapsed, words);
  }

  /** The envelope of a keyed tile; a just-released tile keeps the one it had at release. */
  function waveOf(c: Channel) {
    const held = motion.held.get(c.id);
    if (held) return held.env;
    const active = c.tx ? snapshot!.active_transmissions.find((row) => row.id === c.tx!.tx_id) : undefined;
    const elapsed = c.tx ? Math.max(0, active ? cyclicAge(now, active.t_offset_s) : c.tx.elapsed_s) : 0;
    return envelopeOf(c, elapsed, active?.words);
  }

  function leverPressed(channelId: string, key: "m" | "s" | "r"): void {
    prefs.toggle(LEVER_LIST[key], channelId).catch((error) => console.warn("lever not saved", error));
  }

  /** Arrow keys move focus between tiles; M, S and R work the levers of the focused tile. */
  function tileKeys(event: KeyboardEvent): void {
    const tilesEl = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(".tile")];
    const at = tilesEl.indexOf((event.target as HTMLElement).closest(".tile") as HTMLElement);
    if (at < 0) return;
    const cols = geometry.tileCols;
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
    if (event.key in step) {
      event.preventDefault();
      tilesEl[Math.min(tilesEl.length - 1, Math.max(0, at + step[event.key]))].focus();
    } else if (event.target === tilesEl[at] && event.key.toLowerCase() in LEVER_LIST) {
      leverPressed(tiles[at].id, event.key.toLowerCase() as LeverKey);
    }
  }

  /* ---- CTC strip */
  let routes = $state<RoutesDoc | null>(null);
  onMount(() => {
    api.geo
      .routes()
      .then((doc: Json) => (routes = doc as unknown as RoutesDoc))
      .catch((error) => console.warn("routes unavailable", error));
  });

  const downCap = BACKOFF_S[BACKOFF_S.length - 1];
</script>

<div class="lo-root" class:is-down={linkState === "no-link"} data-link={linkState ?? undefined}>
  {#if blank || !snapshot || !bank || !displayed}
    <!-- nothing has arrived yet: the same boxes, empty -->
    <div class="lo-box hero lo-hero" style={boxStyle(geometry.hero)}>
      <span class="hero__text c-ink-2">LAST KEY-UP</span><span class="hero__big is-2">{BLANK}</span>
    </div>
    <div class="lo-box lo-plot" style={boxStyle(geometry.spectrum)}><span class="lo-bezel"></span></div>
    <div class="lo-box lo-plot" style={boxStyle(geometry.ruler)}></div>
    <div class="lo-box lo-plot lo-fall" style={boxStyle(geometry.waterfall)}><span class="lo-bezel"></span></div>
    <div class="lo-box lo-plot lo-lofar" style={boxStyle(geometry.lofar)}><span class="lo-bezel"></span></div>
    <div class="lo-box br" style={boxStyle(geometry.tiles)}>
      <div class="lo-blank"><span class="t-panel">CHANNELS</span><span class="mono">{BLANK}</span></div>
    </div>
    <div class="lo-box txlog lo-log" style={boxStyle(geometry.log)}>
      <div class="txlog__head"><span class="t-panel">TRANSCRIPT</span><span class="grow"></span></div>
      <div class="txrow-empty">{BLANK}</div>
    </div>
    <div class="lo-box" style={boxStyle(geometry.ctc)}><CtcStrip routes={null} live={{}} width={geometry.ctc[2]} height={geometry.ctc[3]} x0={geometry.ctcX0} /></div>
  {:else}
    <div class="lo-box" style={boxStyle(geometry.hero)}>
      <HeroStrip {hero} feeds={snapshot.feeds} {displayed} faults={snapshot.faults} {offBank} {elsewhere} onshowfeed={showFeed} oninspectfeed={inspectFeedId} />
    </div>

    <FrontWall state={snapshot} bankChannels={bankChannelNumbers} {geometry} {dropAge} feed={displayed} />

    <div class="lo-box" style={boxStyle(geometry.tabs)}>
      <BankTabs banks={bankList} active={bank.id} tileCount={tiles.length} variant={geometry.tileVariant} />
    </div>

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div bind:this={tilesBox} class="lo-box lo-tiles" class:has-solo={prefs.solo.size > 0} style={boxStyle(geometry.tiles)} role="group" aria-label="Channels" onkeydown={tileKeys}>
      {#if tiles.length === 0}
        <div class="lo-empty br">
          <EmptyState title="BANK EMPTY">
            <span class="t-body">Add channels in <a href="/feeds" onclick={(e) => (e.preventDefault(), router.go("/feeds"))}>Feeds &amp; Banks</a>.</span>
          </EmptyState>
        </div>
      {:else}
        <TileGrid cols={geometry.tileCols}>
          {#each tiles as c (c.id)}
            {#snippet wave()}
              <Waveform env={waveOf(c)} width={WAVE_WIDTH} height={16} live />
            {/snippet}
            <ChannelTile
              variant={geometry.tileVariant}
              identity={identityFrom(c, sharedFrequencySuffix(c, snapshot.channels, feedName))}
              state={tileState(c)}
              wave={(c.tx || motion.held.has(c.id)) && geometry.tileVariant === "standard" ? wave : undefined}
              onselect={() => selectChannel(c.id)}
              onlever={(key) => leverPressed(c.id, key)}
            />
          {/each}
        </TileGrid>
      {/if}
    </div>

    <div class="lo-box" style={boxStyle(geometry.log)}>
      <TranscriptLog
        rows={snapshot.transcript.rows}
        countToday={snapshot.transcript.count_today}
        colWidth={geometry.log[2] - 360}
        {bankIds}
        {now}
        onselect={(row) => selectChannel(row.frequency_id)}
      />
    </div>

    <div class="lo-box" style={boxStyle(geometry.ctc)}>
      <CtcStrip {routes} live={snapshot.ctc} width={geometry.ctc[2]} height={geometry.ctc[3]} x0={geometry.ctcX0} />
    </div>

    {#if inspectChannel}
      <ChannelInspector channel={inspectChannel} state={snapshot} {now} {logCount} onclose={closeInspector} />
    {:else if inspectFeed}
      <FeedInspector feed={inspectFeed} state={snapshot} {logCount} onclose={closeInspector} />
    {/if}
  {/if}

  {#if linkState === "no-link"}
    <div class="alarm" role="alert">
      <span class="t-alarm">NO LINK</span>
      <span class="t-body">Backend unreachable for {Math.round(dropAge ?? 0)} s; retrying every {downCap} s.</span>
    </div>
  {/if}
</div>
