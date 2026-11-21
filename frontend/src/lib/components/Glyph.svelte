<script lang="ts" module>
  /** The app's own glyph set (Sprint 6 direction B.6): drawn SVG, so no OS emoji or font fallback anywhere. */
  type Shape = { d: string; filled?: boolean; mirror?: boolean };

  const RIGHT_CHEVRON = "M6 3.5L10.5 8L6 12.5";
  const RIGHT_ARROW = "M2 8H13M9 4L13 8L9 12";

  export const GLYPHS = {
    "chevron-right": { d: RIGHT_CHEVRON },
    "chevron-left": { d: RIGHT_CHEVRON, mirror: true },
    "chevron-down": { d: "M3.5 6L8 10.5L12.5 6" },
    "chevron-up": { d: "M3.5 10L8 5.5L12.5 10" },
    "caret-up": { d: "M8 4L12.5 11H3.5Z", filled: true },
    "caret-down": { d: "M8 12L3.5 5H12.5Z", filled: true },
    "arrow-right": { d: RIGHT_ARROW },
    "arrow-left": { d: RIGHT_ARROW, mirror: true },
    "arrow-up": { d: "M8 14V3M4 7L8 3L12 7" },
    "arrow-down": { d: "M8 2V13M4 9L8 13L12 9" },
    "arrow-up-right": { d: "M5 11L11 5M6 5H11V10" },
    play: { d: "M5 3L13 8L5 13Z", filled: true },
    pause: { d: "M4 3h2.5v10H4zM9.5 3H12v10H9.5z", filled: true },
    close: { d: "M4 4L12 12M12 4L4 12" },
    search: { d: "M7 2.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9M10.5 10.5L14 14" },
    more: { d: "M3 7h2v2H3zM7 7h2v2H7zM11 7h2v2h-2z", filled: true },
  } satisfies Record<string, Shape>;

  export type GlyphName = keyof typeof GLYPHS;
</script>

<script lang="ts">
  let { name, size = 12 }: { name: GlyphName; size?: number } = $props();
  const shape: Shape = $derived(GLYPHS[name]);
</script>

<svg
  class="glyph"
  class:filled={shape.filled}
  width={size}
  height={size}
  viewBox="0 0 16 16"
  aria-hidden="true"
  focusable="false"
>
  <path d={shape.d} class:mirror={shape.mirror} />
</svg>

<style>
  .glyph {
    display: inline-block;
    flex: none;
    vertical-align: -0.1em;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.25;
    stroke-linecap: square;
    stroke-linejoin: miter;
  }
  .glyph.filled {
    fill: currentColor;
    stroke: none;
  }
  .mirror {
    transform: scaleX(-1);
    transform-origin: 8px 8px;
  }
</style>
