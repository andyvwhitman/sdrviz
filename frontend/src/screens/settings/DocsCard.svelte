<script lang="ts">
  /** A card that opens the API documentation (Sprint 6 direction G.6). */
  import Glyph from "$lib/components/Glyph.svelte";
  import { followLink } from "$lib/router.svelte";
</script>

<section class="st-card br" aria-label="API">
  <header class="st-card__head"><span class="t-panel">API</span><span class="grow"></span><span class="t-micro">FOR YOUR OWN APPLICATIONS</span></header>
  <p class="st-docs__text">REST, WebSocket and node protocol, with authentication and diagrams.</p>
  <div class="st-card__actions">
    <a class="btn btn--sm" href="/docs" onclick={followLink}>OPEN API DOCS<Glyph name="chevron-right" size={12} /></a>
  </div>
</section>

<style>
  .st-docs__text { margin: 10px 0 0; font: 400 var(--fs-13)/1.4 var(--font-read); color: var(--ink-2); }
</style>
