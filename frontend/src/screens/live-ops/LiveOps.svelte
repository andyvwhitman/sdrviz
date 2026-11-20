<script lang="ts">
  /**
   * Live Ops (brief 9.1, docs/sprint-5/direction.md section 4): hero strip and front wall across the top; below, the
   * listened node (tabs over a scrolling tile grid of its enabled frequencies, low to high) beside the selected
   * frequency's pane. A fluid CSS grid in real pixels. The system screens reuse this wall: `link` renders
   * it blank (loading, connecting), voided and AGE-stamped after a link drop (reconnecting), or dimmed
   * under the NO LINK alarm (spec 11.17).
   */
  import { onMount, untrack } from "svelte";
  import ChannelTile from "$lib/components/ChannelTile.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import TileGrid from "$lib/components/TileGrid.svelte";
  import Waveform from "$lib/components/Waveform.svelte";
  import * as fmt from "$lib/hud/fmt";
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
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
  import FrequencyLayer from "$lib/components/frequency-editor/FrequencyLayer.svelte";
  import FrequencyWindow from "$lib/components/frequency-editor/FrequencyWindow.svelte";
  import type { Outcome } from "$lib/components/frequency-editor/editorForm";
  import { session } from "$lib/stores/session.svelte";
  import type { Channel, Word } from "$lib/types/live";
  import { BACKOFF_S } from "$lib/ws/link";
  import NodeTabs from "./NodeTabs.svelte";
  import FeedInspector from "./FeedInspector.svelte";
  import FrequencyPane from "./FrequencyPane.svelte";
  import { liveOpsPrefs } from "./liveOpsPrefs.svelte";
  import { paneBounds, paneFraction, panePx, tileColumns, wallBounds, wallFraction, wallPx, waterfallPx } from "./layout";
  import { PX_PER_S } from "./waterfallModel.svelte";
  import { viewport } from "$lib/stores/viewport.svelte";
  import FrontWall from "./FrontWall.svelte";
  import { elsewhereLabel, heroFor } from "./hero";
  import Divider from "./Divider.svelte";
  import HeroStrip from "./HeroStrip.svelte";
  import { KeyupMotion } from "./keyup.svelte";
  import { LEVER_LIST, type LeverKey } from "./mixer";
  
  import PaneEmpty from "./PaneEmpty.svelte";
  import SpectrumView from "./SpectrumView.svelte";
  import type { LiveOpsLink } from "./types";
  import { waveEnvelope, WAVE_WIDTH } from "./wave";
  import { channelNumber, noiseFloor } from "./wall";
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

  /* ---- the listened node on the wall: its enabled frequencies, already sorted low to high by the server */
  const tiles = $derived(snapshot?.channels ?? []);
  const tileIds = $derived(tiles.map((c) => c.id));
  const channelIds = $derived(new Set(tileIds));
  const channelById = $derived(new Map(tiles.map((c) => [c.id, c])));
  const feedById = $derived(new Map((snapshot?.feeds ?? []).map((f) => [f.id, f])));
  const displayed = $derived(snapshot ? (feedById.get(snapshot.listen_feed ?? "") ?? snapshot.feeds[0]) : null);
  const nodeShort = $derived(displayed?.short ?? "");
  const channelNumbers = $derived(tiles.map((c) => Number(c.aar.replace(/\D/g, ""))));

  $effect(() => {
    shell.scope = displayed ? ["NODE", displayed.short] : ["NODE", fmt.BLANK];
  });

  /* ---- hero */
  const hero = $derived(
    snapshot ? heroFor({ channels: snapshot.channels, active: snapshot.active_transmissions, channelIds, now }) : ({ mode: "none" } as const),
  );
  const elsewhere = $derived(snapshot && displayed ? elsewhereLabel(snapshot.active_transmissions, displayed.id, feedName) : null);

  /* ---- selection (URL: `?select=<frequency id>`) and the feed inspector (`?inspect=<feed id>`) */
  const inspectId = $derived(router.query("inspect"));
  /** an old `?inspect=<channel id>` link selects that channel */
  const selectedId = $derived(router.query("select") ?? (inspectId && channelById.has(inspectId) ? inspectId : null));
  const inspectFeed = $derived(inspectId ? feedById.get(inspectId) : undefined);
  let pane = $state<ReturnType<typeof FrequencyPane>>();
  /** the selected frequency's AAR channel number, for the ruler's mark */
  const selectedChannel = $derived(selectedId && channelById.has(selectedId) ? channelNumber(channelById.get(selectedId)!.aar) : null);

  /** Select a frequency into the pane. Selecting the selected one again does nothing: a mis-click must not empty the pane. */
  function selectChannel(id: string): void {
    if (selectedId === id && !inspectId) return;
    if (viewport.handset) {
      // a tap opens the pane as a layer and pushes a history entry, so the system Back closes it
      pushedSelect = true;
      router.go(`/live?select=${encodeURIComponent(id)}`);
    } else {
      router.setQuery({ select: id, inspect: null });
    }
  }
  /** the open layer was opened by a push, so Back can pop it */
  let pushedSelect = false;
  $effect(() => {
    if (!selectedId) pushedSelect = false;
  });
  /* the spectrum view: `?view=spectrum`, a layer of its own, closed by Back */
  const spectrumOpen = $derived(viewport.handset && router.query("view") === "spectrum");
  let pushedSpectrum = false;
  function openSpectrum(): void {
    pushedSpectrum = true;
    router.go("/live?view=spectrum");
  }
  function closeSpectrum(): void {
    if (pushedSpectrum) history.back();
    else router.setQuery({ view: null });
  }
  $effect(() => {
    if (!spectrumOpen) pushedSpectrum = false;
  });

  /** The layer's back button: pop the entry the tap pushed, or (after a reload straight into a layer) clear `?select=`. */
  function back(): void {
    if (pushedSelect) history.back();
    else clearSelection();
  }
  // while a layer covers the list the document does not scroll underneath, and the list keeps its place
  $effect(() => {
    const locked = viewport.handset && (!!selectedId || spectrumOpen);
    document.documentElement.classList.toggle("lo-locked", locked);
    return () => document.documentElement.classList.remove("lo-locked");
  });
  // the handset status line reads the node
  $effect(() => {
    if (!viewport.handset) return;
    shell.statusFallback = displayed ? `NODE ${nodeShort} · ${tiles.length} CH` : undefined;
  });
  function clearSelection(): void {
    liveOpsPrefs.selected = null;
    liveOpsPrefs.save();
    router.setQuery({ select: null, inspect: null });
  }
  /** The previous or next frequency in tile order, wrapping. */
  function stepSelection(direction: -1 | 1): void {
    if (!tileIds.length) return;
    const at = selectedId ? tileIds.indexOf(selectedId) : -1;
    const next = at < 0 ? (direction > 0 ? 0 : tileIds.length - 1) : (at + direction + tileIds.length) % tileIds.length;
    selectChannel(tileIds[next]);
  }
  // remember the selection for the next visit, and come back to it when this one starts with none
  $effect(() => {
    if (!selectedId || liveOpsPrefs.selected === selectedId) return;
    liveOpsPrefs.selected = selectedId;
    liveOpsPrefs.save();
  });
  let restored = false;
  $effect(() => {
    if (restored || !snapshot) return;
    restored = true;
    if (viewport.handset) return; // a phone opens on the list, not on a layer
    const last = liveOpsPrefs.selected;
    const known = last && channelById.has(last);
    if (known && !untrack(() => router.query("select")) && !untrack(() => router.query("inspect"))) router.setQuery({ select: last });
  });
  const closeInspector = () => router.setQuery({ inspect: null });
  const showFeed = (feedId: string) => prefs.update({ listen_feed: feedId }).catch((e) => console.warn("node not switched", e));
  const inspectFeedId = (feedId: string) => router.setQuery({ inspect: feedId });

  /* ---- the edit window (the tile's `⋯`, or `E` on a focused tile): a floating window on desktop, a layer on a phone */
  let editId = $state<string | null>(null);
  let editAnchor = $state<HTMLElement>();
  let editWindow = $state<ReturnType<typeof FrequencyWindow>>();
  function editTile(id: string): void {
    if (editId === id) return;
    const open = () => {
      editAnchor = tileEl(id);
      editId = id;
    };
    if (editWindow) editWindow.requestClose(open);
    else open();
  }
  function edited(outcome: Outcome, id: string): void {
    if (outcome !== "deleted") return;
    editId = null;
    if (selectedId === id) clearSelection();
  }

  /* ---- tiles */
  function tileState(c: Channel): TileInput {
    const held = motion.held.get(c.id); // just released: the tile still shows the keyed channel, frozen
    const base = tileInputFrom(held?.channel ?? c, {
      feeds: Object.fromEntries(feedById),
      listenFeed: snapshot!.listen_feed ?? "",
      selectedId,
      muted: prefs.muted,
      solo: prefs.solo,
      linkDropAgeS: dropAge,
    });
    base.levers = { m: prefs.muted.has(c.id), s: prefs.solo.has(c.id) };
    base.focused = targetedId === c.id || editId === c.id; // the tile that opened the window keeps its ring
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

  function leverPressed(channelId: string, key: LeverKey): void {
    prefs.toggle(LEVER_LIST[key], channelId).catch((error) => console.warn("lever not saved", error));
  }

  /** The columns the tile grid has right now (it re-flows with the window). */
  const columnCount = (area: HTMLElement): number => {
    const grid = area.querySelector(".tile-grid");
    return grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 1;
  };

  /** Arrow keys move focus between tiles; M and S work the levers of the focused tile, E opens its edit window (admin). */
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
      event.preventDefault();
      leverPressed(tiles[at].id, event.key.toLowerCase() as LeverKey);
    } else if (event.target === tilesEl[at] && event.key.toLowerCase() === "e" && session.isAdmin && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      editTile(tiles[at].id);
    }
  }

  /** A double-click on a tile goes straight to its frequency page. */
  function tileDoubleClick(event: MouseEvent): void {
    const tilesEl = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(".tile")];
    const at = tilesEl.indexOf((event.target as HTMLElement).closest(".tile") as HTMLElement);
    if (at >= 0 && (event.target as HTMLElement).closest(".tile button, .tile [role='checkbox']") === null) router.go(`/frequency/${tiles[at].id}`);
  }

  /**
   * Number keys target a tile by its position in the list (1-9; 0 is the tenth; two digits typed quickly, e.g. 1 then 2,
   * reach 12). The targeted tile takes focus, so M, S and E then work its levers (tileKeys).
   */
  const DIGIT_PAIR_MS = 800;
  /** the tile a number key targeted; drawn focused explicitly, since the browser hides focus rings after a click */
  let targetedId = $state<string | null>(null);
  let lastDigit = { key: "", at: 0 };

  function globalKeys(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable]")) return;
    if (event.key === "Escape") return escapeKey(event);
    if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      return stepSelection(event.key === "[" ? -1 : 1);
    }
    if (!/^[0-9]$/.test(event.key)) return;
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
      selectChannel(tiles[index - 1].id);
    }
  }

  /** Esc steps back one layer: a menu or the feed inspector (they handle it), playback, a bucket jump, then the selection. */
  function escapeKey(event: KeyboardEvent): void {
    if (inspectFeed || editId || !selectedId) return;
    event.preventDefault();
    if (!pane?.escape()) clearSelection();
  }

  /* ---- tile density: the chip's choice, or compact when the tile area is shorter than two standard rows */
  let tilesH = $state(0);
  const AUTO_COMPACT_BELOW_PX = 232;
  const autoCompact = $derived(tilesH > 0 && tilesH < AUTO_COMPACT_BELOW_PX);
  const density = $derived<"std" | "cmp">(liveOpsPrefs.density === "cmp" || autoCompact ? "cmp" : "std");
  const tileVariant = $derived(density === "cmp" ? "compact" : "standard");
  const densityChip = $derived({
    shown: density,
    auto: autoCompact && liveOpsPrefs.density === "std",
    ontoggle: () => {
      liveOpsPrefs.density = liveOpsPrefs.density === "std" ? "cmp" : "std";
      liveOpsPrefs.save();
    },
  });

  /* ---- keyed channels out of view get an edge chip; the tile area never scrolls by itself on a key-up */
  let keyedAbove = $state<string[]>([]);
  let keyedBelow = $state<string[]>([]);
  const tileEl = (id: string): HTMLElement | undefined => tilesBox?.querySelectorAll<HTMLElement>(".tile")[tiles.findIndex((c) => c.id === id)];
  function measureEdges(): void {
    if (!tilesBox || viewport.handset) return;
    const box = tilesBox.getBoundingClientRect();
    const above: string[] = [];
    const below: string[] = [];
    for (const c of tiles.filter((t) => t.tx)) {
      const rect = tileEl(c.id)?.getBoundingClientRect();
      if (!rect) continue;
      if (rect.bottom <= box.top + 4) above.push(c.id);
      else if (rect.top >= box.bottom - 4) below.push(c.id);
    }
    keyedAbove = above;
    keyedBelow = below;
  }
  const keyedKey = $derived(tiles.filter((c) => c.tx).map((c) => c.id).join());
  $effect(() => {
    void keyedKey;
    void tilesH;
    void density;
    void tiles.length;
    void frameW;
    measureEdges();
  });
  const showTile = (id: string): void => tileEl(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });

  // the selected tile scrolls into view (a digit, [ ], the hero); a node switch starts the area at the top
  let lastNode = "";
  $effect(() => {
    const id = selectedId;
    const nodeId = displayed?.id ?? "";
    void tiles.length;
    if (viewport.handset || !tilesBox) return;
    const changed = untrack(() => lastNode) !== nodeId;
    lastNode = nodeId;
    const at = id ? tiles.findIndex((c) => c.id === id) : -1;
    if (at >= 0) tilesBox.querySelectorAll(".tile")[at]?.scrollIntoView({ block: "nearest" });
    else if (changed) tilesBox.scrollTop = 0;
  });

  /* ---- the two dividers. The grid is CSS and resolves the saved fractions itself; the sizes measured here only feed a
     drag, a key step, the readout and the ARIA values. */
  let frameW = $state(0);
  let frameH = $state(0);
  /** the divider being dragged, if any: a dragged wall keeps its waterfall stretched until the release */
  let dragging = $state<"wall" | "pane" | null>(null);
  const heroH = $derived(viewport.height < 900 ? 48 : 64);
  const wallSize = $derived(wallPx(liveOpsPrefs.wall, frameH, heroH));
  const paneSize = $derived(panePx(liveOpsPrefs.pane, frameW));
  const wallLimits = $derived(wallBounds(frameH, heroH));
  const paneLimits = $derived(paneBounds(frameW));
  const wallSeconds = $derived(Math.floor(waterfallPx(wallSize) / PX_PER_S));
  const columns = $derived(tileColumns(frameW, paneSize));

  const downCap = BACKOFF_S[BACKOFF_S.length - 1];
</script>

<svelte:window onkeydown={globalKeys} />

{#snippet tileItem(c: Channel, i: number, variant: "standard" | "compact")}
  {#snippet wave()}
    <Waveform env={waveOf(c)} width={WAVE_WIDTH} height={16} live />
  {/snippet}
  <ChannelTile
    {variant}
    identity={identityFrom(c, sharedFrequencySuffix(c, snapshot!.channels, feedName))}
    state={tileState(c)}
    wave={(c.tx || motion.held.has(c.id)) && variant === "standard" ? wave : undefined}
    onselect={() => selectChannel(c.id)}
    onlever={(key) => leverPressed(c.id, key)}
    onedit={session.isAdmin ? () => editTile(c.id) : undefined}
    index={i + 1}
  />
{/snippet}

{#snippet emptyTiles(desktop: boolean)}
  {#if !snapshot?.feeds_listenable.length}
    <EmptyState title="NO NODES">
      {#if session.isAdmin}<span class="t-body"><a href="/settings" onclick={(e) => (e.preventDefault(), router.go("/settings"))}>Add a node in Settings.</a></span>{/if}
    </EmptyState>
  {:else}
    <EmptyState title="NOTHING ENABLED ON {nodeShort}">
      <span class="t-body">Enable frequencies for this node in <a href="/frequencies?node={displayed?.id}" onclick={(e) => (e.preventDefault(), router.go(`/frequencies?node=${displayed?.id}`))}>Frequencies</a>.</span>
      {#if desktop && session.isAdmin}<span class="t-body c-ink-3">Or right-click a channel on the waterfall.</span>{/if}
    </EmptyState>
  {/if}
{/snippet}

{#if viewport.handset}
  <div class="hs" class:is-down={linkState === "no-link"} data-link={linkState ?? undefined}>
    {#if !snapshot || blank}
      <div class="hs__top"><div class="hs__hero"><span class="hs__k">LAST KEY-UP</span><span class="hs__age">{fmt.BLANK}</span></div></div>
    {:else}
      <div class="hs__top">
        <div class="hs__tabs"><NodeTabs nodes={snapshot.feeds_listenable} feeds={snapshot.feeds} active={snapshot.listen_feed} /></div>
        <div class="hs__hero">
          {#if hero.mode === "keyed"}
            <button class="hs__keyed" type="button" onclick={() => selectChannel(hero.id)}>
              <PositionGlyph state="tx" /><span class="hs__aar">{hero.aar4}</span><span class="hs__name">{hero.label}</span><span class="hs__timer">{fmt.dur(hero.elapsedS)}</span>
            </button>
            {#if hero.others.length}<span class="hs__more">+{hero.others.length}</span>{/if}
          {:else if hero.mode === "idle"}
            <span class="hs__k">LAST KEY-UP</span><span class="hs__age">{fmt.age(hero.ageS)}</span><span class="hs__k">· {hero.aar}</span>
          {:else}
            <span class="hs__k">{hero.mode === "empty" ? "NOTHING ENABLED" : "NO KEY-UPS YET"}</span>
          {/if}
          <span class="hs__grow"></span>
          <button class="chip hs__spec" data-chip="nominal" type="button" onclick={openSpectrum}>SPECTRUM</button>
        </div>
      </div>

      <div bind:this={tilesBox} class="hs__list" class:has-solo={prefs.solo.size > 0} role="group" aria-label="Channels" inert={!!selectedId || spectrumOpen || !!editId}>
        {#if tiles.length === 0}
          <div class="hs__empty">
            {@render emptyTiles(false)}
          </div>
        {:else}
          <TileGrid>
            {#each tiles as c, i (c.id)}
              {@render tileItem(c, i, "compact")}
            {/each}
          </TileGrid>
        {/if}
      </div>

      {#if spectrumOpen}
        <SpectrumView state={snapshot} listedChannels={channelNumbers} {dropAge} feed={displayed!} onback={closeSpectrum} />
      {/if}

      {#if selectedId}
        <div class="hs__layer">
          <FrequencyPane bind:this={pane} variant="layer" frequencyId={selectedId} backLabel={nodeShort} onback={back} onclose={clearSelection} />
        </div>
      {/if}
    {/if}
  </div>
{:else}
<div class="lo-frame" data-link={linkState ?? undefined} bind:clientWidth={frameW} bind:clientHeight={frameH}>
  <div
    class="lo"
    class:is-down={linkState === "no-link"}
    data-pane={liveOpsPrefs.pane === null ? undefined : ""}
    style:--wall-frac={liveOpsPrefs.wall ?? undefined}
    style:--pane-frac={liveOpsPrefs.pane ?? undefined}
  >
    {#if blank || !snapshot || !displayed}
      <!-- nothing has arrived yet: the same boxes, empty -->
      <div class="lo__hero hero lo-hero">
        <span class="hero__text c-ink-2">LAST KEY-UP</span><span class="hero__big is-2">{fmt.BLANK}</span>
      </div>
      <div class="lo__wall lo-wall lo-wall--blank">
        <div class="lo-cell lo-cell--spectrum"><div class="lo-plot"><span class="lo-bezel"></span></div></div>
        <div class="lo-cell lo-cell--ruler"></div>
        <div class="lo-cell lo-cell--fall"><div class="lo-plot lo-fall"><span class="lo-bezel"></span></div></div>
        <div class="lo-cell lo-cell--strip"></div>
      </div>
      <div class="lo__lower">
        <div class="lo__bank br">
          {#if snapshot && !blank}
            <div class="lo-empty br">{@render emptyTiles(true)}</div>
          {:else}
            <div class="lo-blank"><span class="t-panel">CHANNELS</span><span class="mono">{fmt.BLANK}</span></div>
          {/if}
        </div>
        <div class="lo__gutter"></div>
        <div class="lo__pane br"></div>
      </div>
    {:else}
      <div class="lo__hero">
        <HeroStrip {hero} onselect={selectChannel} {displayed} faults={snapshot.faults} {elsewhere} onshowfeed={showFeed} oninspectfeed={inspectFeedId} />
      </div>

      <div class="lo__wall">
        <FrontWall state={snapshot} listedChannels={channelNumbers} {dropAge} feed={displayed} resizing={dragging === "wall"} {selectedChannel} />
      </div>
      <Divider
        class="lo__dv-wall"
        orientation="horizontal"
        size={wallSize}
        limits={wallLimits}
        grows={1}
        label="Wall height"
        readout="WALL {wallSize} · WATERFALL {wallSeconds} S"
        valuetext="Wall {wallSize} pixels, waterfall {wallSeconds} seconds"
        onsize={(px) => (liveOpsPrefs.wall = wallFraction(px, frameH))}
        oncommit={() => liveOpsPrefs.save()}
        onreset={() => ((liveOpsPrefs.wall = null), liveOpsPrefs.save())}
        ondragging={(on) => (dragging = on ? "wall" : null)}
      />

      <div class="lo__lower">
        <div class="lo__bank">
          <div class="lo__tabs">
            <NodeTabs nodes={snapshot.feeds_listenable} feeds={snapshot.feeds} active={snapshot.listen_feed} density={densityChip} />
          </div>

          <div class="lo__tilebox">
          {#if keyedAbove.length}
            <button class="lo-edge lo-edge--above" type="button" onclick={() => showTile(keyedAbove[0])}><PositionGlyph state="tx" />▲ {keyedAbove.length === 1 ? tiles.find((c) => c.id === keyedAbove[0])?.aar : `${keyedAbove.length}`} KEYED</button>
          {/if}
          {#if keyedBelow.length}
            <button class="lo-edge lo-edge--below" type="button" onclick={() => showTile(keyedBelow[0])}><PositionGlyph state="tx" />▼ {keyedBelow.length === 1 ? tiles.find((c) => c.id === keyedBelow[0])?.aar : `${keyedBelow.length}`} KEYED</button>
          {/if}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div bind:this={tilesBox} bind:clientHeight={tilesH} onscroll={measureEdges} class="lo__tiles" class:has-solo={prefs.solo.size > 0} role="group" aria-label="Channels" onkeydown={tileKeys} ondblclick={tileDoubleClick} onfocusout={(e) => !(e.relatedTarget as HTMLElement | null)?.closest(".tile") && (targetedId = null)}>
            {#if tiles.length === 0}
              <div class="lo-empty br">
                {@render emptyTiles(true)}
              </div>
            {:else}
              <TileGrid>
                {#each tiles as c, i (c.id)}
                  {@render tileItem(c, i, tileVariant)}
                {/each}
              </TileGrid>
            {/if}
          </div>
          </div>
        </div>

        <Divider
          class="lo__gutter"
          orientation="vertical"
          size={paneSize}
          limits={paneLimits}
          grows={-1}
          label="Pane width"
          readout="PANE {paneSize} · {columns} {columns === 1 ? 'COLUMN' : 'COLUMNS'}"
          valuetext="Pane {paneSize} pixels, {columns} tile {columns === 1 ? 'column' : 'columns'}"
          onsize={(px) => (liveOpsPrefs.pane = paneFraction(px, frameW))}
          oncommit={() => liveOpsPrefs.save()}
          onreset={() => ((liveOpsPrefs.pane = null), liveOpsPrefs.save())}
          ondragging={(on) => (dragging = on ? "pane" : null)}
        />

        <div class="lo__pane br">
          {#if selectedId}
            <FrequencyPane bind:this={pane} frequencyId={selectedId} onstep={stepSelection} onclose={clearSelection} />
          {:else}
            <PaneEmpty />
          {/if}
          {#if inspectFeed}
            <FeedInspector feed={inspectFeed} state={snapshot} onclose={closeInspector} />
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
{/if}

{#if editId}
  {#if viewport.handset}
    <FrequencyLayer frequencyId={editId} listenedFeedId={displayed?.id} onclose={() => (editId = null)} ondone={edited} />
  {:else if editAnchor}
    <FrequencyWindow bind:this={editWindow} frequencyId={editId} anchor={editAnchor} kind="tile" listenedFeedId={displayed?.id} onclose={() => (editId = null)} ondone={edited} />
  {/if}
{/if}
