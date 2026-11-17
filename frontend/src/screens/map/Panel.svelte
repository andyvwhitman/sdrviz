<script module lang="ts">
  /** What every panel's content hands the shell. */
  export interface PanelControls {
    full: boolean;
    onclose: () => void;
    onfull: (full: boolean) => void;
    onback?: (() => void) | null;
  }
</script>

<script lang="ts">
  /**
   * The shell of the map's one side panel (decision 23): docked to the right edge of the map, or maximized over the
   * page area with a border through which the dimmed map shows. A click on that border closes it. The station, trip
   * and route panels are its content. It is one element in both states, so maximizing keeps what has loaded.
   */
  import type { Snippet } from "svelte";
  import Chip from "$lib/components/Chip.svelte";

  interface Props {
    title: string;
    /** the line under the title */
    kind?: string;
    label: string;
    full: boolean;
    onclose: () => void;
    onfull: (full: boolean) => void;
    /** present when there is a previous panel to return to */
    onback?: (() => void) | null;
    /** a short glance status at the right of the line under the title (e.g. data freshness) */
    status?: Snippet;
    children: Snippet;
  }
  let { title, kind = "", label, full, onclose, onfull, onback = null, status, children }: Props = $props();

  const fullLabel = $derived(full ? "Restore to the side panel" : "Maximize the panel");
</script>

<!-- the border click is for the pointer; Esc is the keyboard way (handled by the map screen) -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="pn-root" class:is-full={full} onclick={(e) => e.target === e.currentTarget && onclose()}>
  <section class="pn br" aria-label={label}>
    <header class="pn__bar">
      {#if onback}<Chip text="BACK" kind="filter" button title="Back to the previous panel" onclick={onback} />{/if}
      <span class="pn__title">{title}</span>
      <button class="chip chip--icon" data-chip="nominal" aria-label={fullLabel} title={fullLabel} onclick={() => onfull(!full)}>
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true">
          {#if full}
            <path d="M1 6h5V1M10 1v5h5M15 10h-5v5M6 15v-5H1" />
          {:else}
            <path d="M1 5.5V1h4.5M10.5 1H15v4.5M15 10.5V15h-4.5M5.5 15H1v-4.5" />
          {/if}
        </svg>
      </button>
      <Chip text="ESC" button title="Close" onclick={onclose} />
    </header>
    {#if kind || status}<div class="pn__kind"><span class="pn__kindtext">{kind}</span>{#if status}<span class="pn__status">{@render status()}</span>{/if}</div>{/if}
    <div class="pn__body">{@render children()}</div>
  </section>
</div>

<style>
  /* docked: the right edge of the map, full height; the map beside it stays live */
  .pn-root { position: absolute; z-index: 5; top: 0; right: 0; bottom: 0; width: var(--pn-w, 440px); pointer-events: none; }
  /* maximized: the whole page area, dimmed; its border is the way out */
  .pn-root.is-full { z-index: 7; left: 0; width: auto; pointer-events: auto; background: rgb(0 0 0 / 0.35); }
  .pn {
    position: absolute; inset: 0; display: flex; flex-direction: column; gap: 6px; min-height: 0; pointer-events: auto;
    padding: 12px 16px 14px; background: var(--bg-raised); box-shadow: 0 0 0 1px var(--bg-void), -12px 0 32px rgb(0 0 0 / 0.45);
  }
  .is-full .pn { inset: 28px; padding: 16px 24px 20px; box-shadow: 0 0 0 1px var(--bg-void), 0 12px 48px rgb(0 0 0 / 0.6); }
  .pn::before { --c: var(--line); }
  .pn__bar { display: flex; align-items: center; gap: 8px; min-height: 32px; }
  .pn__title { flex: 1; min-width: 0; font: var(--type-title); letter-spacing: var(--track-title); text-transform: uppercase; color: var(--ink); overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; }
  .is-full .pn__title { font: var(--type-title-lg); letter-spacing: var(--track-title); }
  .pn__kind { display: flex; justify-content: space-between; gap: 12px; font: 500 var(--fs-11)/1.2 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-3); text-transform: uppercase; }
  .pn__kindtext { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pn__status { flex: none; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .pn__body { flex: 1; display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow: auto; }
</style>
