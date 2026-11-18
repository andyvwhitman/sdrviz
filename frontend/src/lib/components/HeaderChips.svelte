<script lang="ts">
  /** System chips, the solo count, clock and the fullscreen button: the right side of the header. */
  import { audio } from "$lib/stores/audio.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import type { ChipSpec } from "$lib/hud/chips";
  import Chip from "./Chip.svelte";

  interface Props {
    chips: ChipSpec[];
    clock: string;
    /** the link is down: add the RECONNECTING chip */
    reconnecting?: boolean;
  }
  let { chips, clock, reconnecting = false }: Props = $props();

  const label = $derived(ui.fullscreen ? "Exit fullscreen" : "Fullscreen");

  /** F toggles fullscreen anywhere except while typing. */
  function keys(event: KeyboardEvent): void {
    if (event.key.toLowerCase() !== "f" || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    ui.toggleFullscreen();
  }
</script>

<svelte:window onkeydown={keys} />

{#each chips as chip}
  <Chip text={chip.text} kind={chip.kind} glyph={chip.glyph} onset={chip.onset} title={chip.title} />
{/each}
{#if reconnecting}<Chip text="RECONNECTING" kind="offline" />{/if}
{#if audio.soloCount}<Chip text="SOLO {audio.soloCount}" kind="active" />{/if}
<button class="hud-clock" title="Toggle UTC" onclick={() => ui.toggleUtc()}>{clock}</button>
<button
  class="chip chip--icon"
  data-chip={ui.fullscreen ? "active" : "nominal"}
  aria-label={label}
  title="{label} (F)"
  aria-keyshortcuts="F"
  onclick={() => ui.toggleFullscreen()}
>
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true">
    {#if ui.fullscreen}
      <path d="M1 6h5V1M10 1v5h5M15 10h-5v5M6 15v-5H1" />
    {:else}
      <path d="M1 5.5V1h4.5M10.5 1H15v4.5M15 10.5V15h-4.5M5.5 15H1v-4.5" />
    {/if}
  </svg>
</button>
