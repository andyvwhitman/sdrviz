<script lang="ts">
  /**
   * The corner audio toggle: a small speaker at the bottom right of every screen. Audio is on by default; this
   * mutes it all. Before the first click on the page the browser holds sound back, and the speaker says so.
   */
  import { audio } from "$lib/stores/audio.svelte";

  const label = $derived(audio.muted ? "Unmute audio" : audio.unlocked ? "Mute audio" : "Audio starts on your first click · click to mute");
</script>

<button
  class="atg"
  class:is-muted={audio.muted}
  class:is-waiting={!audio.muted && !audio.unlocked}
  type="button"
  aria-label={label}
  aria-pressed={audio.muted}
  title={label}
  onclick={() => audio.toggle()}
>
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true">
    <path d="M2 6h3l4-3v10l-4-3H2z" />
    {#if audio.muted}
      <path d="M11 6l4 4M15 6l-4 4" />
    {:else}
      <path d="M11.5 5.5a3.5 3.5 0 0 1 0 5M13 3.5a6 6 0 0 1 0 9" />
    {/if}
  </svg>
</button>

<style>
  .atg {
    display: inline-flex; align-items: center; justify-content: center; flex: none;
    width: 28px; height: 28px; padding: 0; margin: 0 6px 0 auto; border: 0; border-radius: 0; cursor: pointer;
    background: none; color: var(--ink-3); opacity: 0.7;
    transition: opacity 120ms var(--ease-out, ease-out), color 120ms var(--ease-out, ease-out);
  }
  .atg:hover, .atg:focus-visible { opacity: 1; color: var(--ink); }
  .atg:focus-visible { outline: 1px solid var(--state-select); outline-offset: -2px; }
  .atg.is-waiting { opacity: 0.45; }
  .atg.is-muted { color: var(--ink-2); opacity: 0.9; }
</style>
