<script lang="ts">
  /** M6 position-light glyph, HTML form (an 18 x 18 mask; `color` sets the tone). Spec 5.2. */
  import type { GlyphState } from "$lib/hud/tile";

  interface Props {
    state?: GlyphState;
    /** idle in the dimmed armed tone */
    dim?: boolean;
    class?: string;
  }
  let { state = "idle", dim = false, class: className = "" }: Props = $props();
</script>

<span class="glyph {className}" class:is-dim={dim} data-g={state} aria-hidden="true"></span>
