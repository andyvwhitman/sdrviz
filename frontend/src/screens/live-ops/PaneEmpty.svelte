<script lang="ts">
  /** The pane with nothing selected (direction 5.5): an empty reticle and what to do. Nothing moves. */
  const touch = matchMedia("(pointer: coarse)").matches;
</script>

<div class="pe">
  <svg class="pe__mark" width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="12" fill="none" stroke="var(--line-faint)" stroke-width="1" />
    <path d="M24.5 0V10M24.5 38V48M0 24.5H10M38 24.5H48" stroke="var(--line-faint)" stroke-width="1" fill="none" />
  </svg>
  <p class="pe__title">NO FREQUENCY SELECTED</p>
  <p class="pe__hint">{touch ? "Tap a channel." : "Select a tile, or press 1–9."}</p>
</div>

<style>
  .pe { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; }
  .pe__mark { display: block; margin-bottom: 16px; }
  .pe__title { margin: 0; font: 600 var(--fs-15)/1.2 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-3); }
  .pe__hint { margin: 8px 0 0; font: 400 var(--fs-13)/1.2 var(--font-read); color: var(--ink-3); }
</style>
