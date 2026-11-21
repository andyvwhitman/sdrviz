<script lang="ts">
  /**
   * The node picker (Sprint 6 direction C.5): the feed name on Live Ops is a button that opens a menu of the SDR feeds
   * this browser can listen to. Choosing one is this browser's own viewing choice (`listen.choose`), so any signed-in
   * user may; nothing is shared. Two more items sit under a rule: the listened feed's details, and all feeds.
   * On the desktop the trigger is a chip in the hero strip; on a phone it is a 44 px row across the width.
   */
  import { onMount, tick } from "svelte";
  import type { ChipKind } from "$lib/hud/chips";
  import type { GlyphState } from "$lib/hud/tile";
  import { router } from "$lib/router.svelte";
  import { listen } from "$lib/stores/listen.svelte";
  import type { Feed, ListenableFeed } from "$lib/types/live";
  import Glyph from "./Glyph.svelte";
  import PositionGlyph from "./PositionGlyph.svelte";

  interface Props {
    nodes: readonly ListenableFeed[];
    feeds: readonly Feed[];
    /** the feed this browser listens to */
    active: string;
    /** feeds with a frequency keyed right now */
    keyedFeeds: ReadonlySet<string>;
    /** the trigger's chip kind: active, degraded or fault */
    kind?: ChipKind;
    /** the desktop chip, or the phone's full-width row */
    variant?: "chip" | "row";
    /** the trigger's position light, when the feed has a fault */
    fault?: boolean;
    /** the "DETAILS" item: open the feed inspector (omit where there is none) */
    oninspect?: (feedId: string) => void;
  }
  let { nodes, feeds, active, keyedFeeds, kind = "active", variant = "chip", fault = false, oninspect }: Props = $props();

  const feedOf = (id: string): Feed | undefined => feeds.find((f) => f.id === id);
  const activeShort = $derived(nodes.find((n) => n.feed_id === active)?.short ?? feedOf(active)?.short ?? "");
  const activeCount = $derived(feedOf(active)?.hears.length ?? 0);

  const POSITION: Partial<Record<Feed["state"], GlyphState>> = { stale: "stale", offline: "offline", disabled: "offline", fault: "fault" };
  const WORD: Partial<Record<Feed["state"], string>> = { stale: "STALE", offline: "OFFLINE", disabled: "OFFLINE", fault: "FAULT" };

  const items = $derived(
    nodes.map((node) => {
      const feed = feedOf(node.feed_id);
      const state = feed?.state ?? "offline";
      return {
        id: node.feed_id,
        short: node.short,
        site: feed?.site ?? "",
        light: keyedFeeds.has(node.feed_id) ? ("tx" as const) : POSITION[state],
        /** the right-hand text: how many frequencies are on, or why not */
        word: WORD[state] ?? `${feed?.hears.length ?? 0} ON`,
        wordState: state,
      };
    }),
  );

  let open = $state(false);
  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLElement>();
  const menuId = $props.id();

  const entries = (): HTMLElement[] => [...(menu?.querySelectorAll<HTMLElement>("[role^='menuitem']") ?? [])];

  async function show(focus: "checked" | "first" | "last" = "checked"): Promise<void> {
    open = true;
    await tick();
    const all = entries();
    const target = focus === "first" ? all[0] : focus === "last" ? all[all.length - 1] : (all.find((el) => el.getAttribute("aria-checked") === "true") ?? all[0]);
    target?.focus();
  }

  /** Close the menu and put focus back on the trigger. */
  function hide(): void {
    if (!open) return;
    open = false;
    trigger?.focus();
  }

  function choose(feedId: string): void {
    listen.choose(feedId);
    hide();
  }

  function triggerKeys(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      void show("checked");
    }
  }

  function menuKeys(event: KeyboardEvent): void {
    const all = entries();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      event.preventDefault();
      all[(to + all.length) % all.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        return move(at + 1);
      case "ArrowUp":
        return move(at - 1);
      case "Home":
        return move(0);
      case "End":
        return move(all.length - 1);
      case "Escape":
        event.preventDefault();
        event.stopPropagation(); // Esc closes the menu only; Live Ops would step back a layer
        return hide();
      case "Tab":
        event.preventDefault();
        return hide();
    }
  }

  onMount(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (open && !menu?.contains(target) && !trigger?.contains(target)) open = false;
    };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  });
</script>

<div class="np np--{variant}">
  <button
    bind:this={trigger}
    class="np__trigger"
    class:chip={variant === "chip"}
    data-chip={variant === "chip" ? kind : undefined}
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls={open ? menuId : undefined}
    title="Choose the feed to listen to"
    onclick={() => (open ? hide() : void show())}
    onkeydown={triggerKeys}
  >
    {#if variant === "chip"}
      {#if fault}<PositionGlyph state="fault" />{/if}FEED · {activeShort}<Glyph name="chevron-down" size={12} />
    {:else}
      <PositionGlyph state={fault ? "fault" : keyedFeeds.has(active) ? "tx" : (POSITION[feedOf(active)?.state ?? "ok"] ?? "idle")} />
      <span class="np__name">{activeShort}</span>
      <span class="np__count">· {activeCount} ON</span>
      <span class="np__grow"></span>
      <Glyph name="chevron-down" size={16} />
    {/if}
  </button>

  {#if open}
    <div bind:this={menu} id={menuId} class="np__menu lo-menu br" role="menu" aria-label="Listen to" tabindex="-1" onkeydown={menuKeys}>
      <div class="np__head"><span class="np__listen">LISTEN TO</span><span class="np__total">{nodes.length} {nodes.length === 1 ? "NODE" : "NODES"}</span></div>
      <div class="np__items">
        {#each items as item (item.id)}
          <button class="np__item" type="button" role="menuitemradio" aria-checked={item.id === active} tabindex="-1" onclick={() => choose(item.id)}>
            <span class="np__light">{#if item.light}<PositionGlyph state={item.light} />{/if}</span>
            <span class="np__short">{item.short}</span>
            <span class="np__site">{item.site}</span>
            <span class="np__word" data-state={item.wordState}>{item.word}</span>
          </button>
        {/each}
      </div>
      <div class="np__rule"></div>
      {#if oninspect}
        <button class="np__link" type="button" role="menuitem" tabindex="-1" onclick={() => (hide(), oninspect(active))}>{activeShort} DETAILS<Glyph name="chevron-right" size={12} /></button>
      {/if}
      <button class="np__link" type="button" role="menuitem" tabindex="-1" onclick={() => (hide(), router.go(`/feeds?feed=${encodeURIComponent(active)}`))}>ALL FEEDS<Glyph name="chevron-right" size={12} /></button>
    </div>
  {/if}
</div>

<style>
  .np { position: relative; display: inline-flex; }
  .np--row { display: flex; width: 100%; }
  .np__trigger { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  .np--row .np__trigger { width: 100%; height: 44px; padding: 0 16px; gap: 8px; color: var(--ink); box-shadow: inset 0 -1px 0 var(--grid); }
  .np__name { font: 600 var(--fs-15)/1 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; }
  .np__count { font: 400 var(--fs-13)/1 var(--font-data); color: var(--ink-2); }
  .np__grow { flex: 1; }

  .np__menu { position: absolute; top: calc(100% + 8px); right: 0; width: 360px; max-width: calc(100vw - 16px); padding: 0; display: block; }
  .np--row .np__menu { top: 100%; left: 0; right: auto; width: 100%; max-width: none; }
  .np__head { display: flex; align-items: center; justify-content: space-between; height: 28px; padding: 0 12px; }
  .np__listen { font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-3); }
  .np__total { font: 400 var(--fs-11)/1 var(--font-data); color: var(--ink-3); }
  .np__items { max-height: 320px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--line-faint) transparent; }
  .np--row .np__items { max-height: 384px; }

  .np__item, .np__link { width: 100%; text-align: left; background: none; border: 0; cursor: pointer; color: var(--ink-2); }
  .np__item { position: relative; display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; }
  .np--row .np__item { height: 48px; }
  .np__item[aria-checked="true"] { color: var(--ink); box-shadow: inset 2px 0 0 var(--state-select); }
  .np__item:hover, .np__item:focus-visible, .np__link:hover, .np__link:focus-visible { background: var(--grid); color: var(--ink); outline: none; }
  .np__light { width: 16px; height: 16px; flex: none; display: inline-flex; align-items: center; justify-content: center; }
  .np__short { font: 600 var(--fs-13)/1 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink); }
  .np__site { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 500 var(--fs-12)/1 var(--font-label); color: var(--ink-2); }
  .np__word { flex: none; font: 400 var(--fs-12)/1 var(--font-data); color: var(--ink-2); }
  .np__word[data-state="stale"] { color: var(--state-stale); }
  .np__word[data-state="offline"], .np__word[data-state="disabled"] { color: var(--ink-3); }
  .np__word[data-state="fault"] { color: var(--state-fault); }

  .np__rule { height: 1px; background: var(--grid); }
  .np__link { display: flex; align-items: center; justify-content: space-between; height: 32px; padding: 0 12px; font: 500 var(--fs-12)/1 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; }
  .np--row .np__link { height: 48px; }
</style>
