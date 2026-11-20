<script lang="ts">
  /**
   * Live Ops (brief 9.1, docs/sprint-4/liveops-direction.md): hero strip and front wall across the top; below, the
   * bank (tabs over a scrolling tile grid) beside the selected frequency's pane. A fluid CSS grid in real pixels. The system screens reuse this wall: `link` renders
   * it blank (loading, connecting), voided and AGE-stamped after a link drop (reconnecting), dimmed
   * under the NO LINK alarm, or with an empty bank (spec 11.17).
   */
  import { onMount, untrack } from "svelte";
  import ChannelTile from "$lib/components/ChannelTile.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import TileGrid from "$lib/components/TileGrid.svelte";
  import Waveform from "$lib/components/Waveform.svelte";
  import { BLANK } from "$lib/hud/fmt";
  import { feedName } from "$lib/hud/roles";
  import { identityFrom, sharedFrequencySuffix, tileInputFrom, type TileInput } from "$lib/hud/tile";
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
  import FeedInspector from "./FeedInspector.svelte";
  import FrontWall from "./FrontWall.svelte";
    import { elsewhereLabel, heroFor, offBankLabel } from "./hero";
  import HeroStrip from "./HeroStrip.svelte";
  import { KeyupMotion } from "./keyup.svelte";
  import { LEVER_LIST, type LeverKey } from "./mixer";
  
  import PaneEmpty from "./PaneEmpty.svelte";
  import type { LiveOpsLink } from "./types";
  import { waveEnvelope, WAVE_WIDTH } from "./wave";
  import { noiseFloor } from "./wall";
  import "./live-ops.css";

  interface Props {
    link?: LiveOpsLink;
  }
  let { link: forced }: Props = $props();

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
    base.focused = targetedId === c.id;
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

  /** The columns the tile grid has right now (it re-flows with the window). */
  const columnCount = (area: HTMLElement): number => {
    const grid = area.querySelector(".tile-grid");
    return grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 1;
  };

  /** Arrow keys move focus between tiles; M, S and R work the levers of the focused tile. */
  function tileKeys(event: KeyboardEvent): void {
    const tilesEl = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(".tile")];
    const at = tilesEl.indexOf((event.target as HTMLElement).closest(".tile") as HTMLElement);
    if (at < 0) return;
    const cols = columnCount(event.currentTarget as HTMLElement);
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
    if (event.key in step) {
      event.preventDefault();
      targetedId = null; // arrow keys show the browser's own focus ring
      tilesEl[Math.min(tilesEl.length - 1, Math.max(0, at + step[event.key]))].focus();
    } else if (event.target === tilesEl[at] && event.key.toLowerCase() === "f" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); // F opens the channel's frequency page
      router.go(`/frequency/${tiles[at].id}`);
    } else if (event.target === tilesEl[at] && event.key.toLowerCase() in LEVER_LIST) {
      event.preventDefault(); // R is also a tab hotkey: the focused tile's lever wins
      leverPressed(tiles[at].id, event.key.toLowerCase() as LeverKey);
    }
  }

  /** A double-click on a tile goes straight to its frequency page. */
  function tileDoubleClick(event: MouseEvent): void {
    const tilesEl = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(".tile")];
    const at = tilesEl.indexOf((event.target as HTMLElement).closest(".tile") as HTMLElement);
    if (at >= 0 && (event.target as HTMLElement).closest(".tile button, .tile [role='checkbox']") === null) router.go(`/frequency/${tiles[at].id}`);
  }

  /**
   * Number keys target a tile by its bank index (1-9; 0 is the tenth; two digits typed quickly, e.g. 1 then 2,
   * reach 12). The targeted tile takes focus, so M, S and R then work its levers (tileKeys).
   */
  const DIGIT_PAIR_MS = 800;
  /** the tile a number key targeted; drawn focused explicitly, since the browser hides focus rings after a click */
  let targetedId = $state<string | null>(null);
  let lastDigit = { key: "", at: 0 };

  function globalKeys(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey || !/^[0-9]$/.test(event.key)) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable]")) return;
    const now = performance.now();
    const pair = now - lastDigit.at < DIGIT_PAIR_MS ? Number(lastDigit.key + event.key) : NaN;
    const single = event.key === "0" ? 10 : Number(event.key);
    const index = pair >= 1 && pair <= tiles.length ? pair : single;
    lastDigit = { key: event.key, at: now };
    const tile = tilesBox?.querySelectorAll<HTMLElement>(".tile")[index - 1];
    if (tile) {
      event.preventDefault();
      targetedId = tiles[index - 1].id;
      tile.focus();
    }
  }

  /** A click anywhere that is not a control, a tile, a transcript row or the inspector closes the inspector. */
  function clickAway(event: MouseEvent): void {
    if (!inspectId) return;
    const target = event.target as HTMLElement;
    if (target.closest(".inspector, .tile, .txrow, button, a, input, select, textarea, [role='button']")) return;
    router.setQuery({ select: null, inspect: null });
  }

  const downCap = BACKOFF_S[BACKOFF_S.length - 1];
</script>

<svelte:window onkeydown={globalKeys} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="lo-frame" data-link={linkState ?? undefined} onclick={clickAway}>
  <div class="lo" class:is-down={linkState === "no-link"}>
    {#if blank || !snapshot || !bank || !displayed}
      <!-- nothing has arrived yet: the same boxes, empty -->
      <div class="lo__hero hero lo-hero">
        <span class="hero__text c-ink-2">LAST KEY-UP</span><span class="hero__big is-2">{BLANK}</span>
      </div>
      <div class="lo__wall lo-wall lo-wall--blank">
        <div class="lo-cell lo-cell--spectrum"><div class="lo-plot"><span class="lo-bezel"></span></div></div>
        <div class="lo-cell lo-cell--ruler"></div>
        <div class="lo-cell lo-cell--fall"><div class="lo-plot lo-fall"><span class="lo-bezel"></span></div></div>
      </div>
      <div class="lo__lower">
        <div class="lo__bank br"><div class="lo-blank"><span class="t-panel">CHANNELS</span><span class="mono">{BLANK}</span></div></div>
        <div class="lo__gutter"></div>
        <div class="lo__pane br"></div>
      </div>
    {:else}
      <div class="lo__hero">
        <HeroStrip {hero} feeds={snapshot.feeds} {displayed} faults={snapshot.faults} {offBank} {elsewhere} onshowfeed={showFeed} oninspectfeed={inspectFeedId} liveBank={bank.id === "bank-live"} />
      </div>

      <div class="lo__wall">
        <FrontWall state={snapshot} bankChannels={bankChannelNumbers} {dropAge} feed={displayed} />
      </div>

      <div class="lo__lower">
        <div class="lo__bank">
          <div class="lo__tabs">
            <BankTabs banks={bankList} active={bank.id} tileCount={tiles.length} variant="standard" />
          </div>

          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div bind:this={tilesBox} class="lo__tiles" class:has-solo={prefs.solo.size > 0} role="group" aria-label="Channels" onkeydown={tileKeys} ondblclick={tileDoubleClick} onfocusout={(e) => !(e.relatedTarget as HTMLElement | null)?.closest(".tile") && (targetedId = null)}>
            {#if tiles.length === 0}
              <div class="lo-empty br">
                {#if bank.id === "bank-live"}
                  <EmptyState title="LIVE BANK EMPTY" detail="Click a channel on the waterfall to listen." />
                {:else}
                  <EmptyState title="BANK EMPTY">
                    <span class="t-body">Add channels in <a href="/feeds" onclick={(e) => (e.preventDefault(), router.go("/feeds"))}>Feeds &amp; Banks</a>.</span>
                  </EmptyState>
                {/if}
              </div>
            {:else}
              <TileGrid>
                {#each tiles as c, i (c.id)}
                  {#snippet wave()}
                    <Waveform env={waveOf(c)} width={WAVE_WIDTH} height={16} live />
                  {/snippet}
                  <ChannelTile
                    variant="standard"
                    identity={identityFrom(c, sharedFrequencySuffix(c, snapshot.channels, feedName))}
                    state={tileState(c)}
                    wave={c.tx || motion.held.has(c.id) ? wave : undefined}
                    onselect={() => selectChannel(c.id)}
                    onlever={(key) => leverPressed(c.id, key)}
                    index={i + 1}
                  />
                {/each}
              </TileGrid>
            {/if}
          </div>
        </div>

        <div class="lo__gutter"></div>

        <div class="lo__pane br">
          <PaneEmpty />
          {#if inspectChannel}
            <ChannelInspector channel={inspectChannel} state={snapshot} {now} {logCount} onclose={closeInspector} />
          {:else if inspectFeed}
            <FeedInspector feed={inspectFeed} state={snapshot} {logCount} onclose={closeInspector} />
          {/if}
        </div>
      </div>
    {/if}

    {#if linkState === "no-link"}
      <div class="alarm" role="alert">
        <span class="t-alarm">NO LINK</span>
        <span class="t-body">Backend unreachable for {Math.round(dropAge ?? 0)} s; retrying every {downCap} s.</span>
      </div>
    {/if}
  </div>
</div>
