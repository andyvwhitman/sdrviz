<script lang="ts">
  /**
   * The floating edit window (direction 8.3): non-modal, anchored beside a tile or under a button so the thing being
   * edited stays in view. It positions only itself. Esc, a click outside, or `×` ask the editor to close (unsaved
   * details raise the discard prompt first); focus returns to the anchor.
   *
   * Mount it with `{#if open}`; unmounting closes it. To swap to another frequency, ask the editor first:
   * `window.requestClose(() => open = other)`.
   */
  import { onMount } from "svelte";
  import FrequencyEditor from "./FrequencyEditor.svelte";
  import type { Outcome } from "./editorForm";
  import { place } from "./placement";

  interface Props {
    frequencyId: string;
    /** the tile or the `⋯` button; the window opens beside it and focus goes back to it */
    anchor: HTMLElement;
    /** where focus goes on close, when not the anchor (the tile's `⋯`, while the tile stays the placement anchor) */
    returnFocus?: HTMLElement;
    kind: "tile" | "button";
    onclose: () => void;
    ondone: (outcome: Outcome, id: string) => void;
    openPage?: boolean;
    listenedFeedId?: string;
  }
  let { frequencyId, anchor, returnFocus, kind, onclose, ondone, openPage = true, listenedFeedId }: Props = $props();

  let box = $state<HTMLElement>();
  let editor = $state<ReturnType<typeof FrequencyEditor>>();
  let height = $state(0);
  let pos = $state({ left: 0, top: 0 });

  /** The content area: under the header, above the status line (the CSS tokens name both). */
  function contentArea() {
    const root = getComputedStyle(document.documentElement);
    const header = parseFloat(root.getPropertyValue("--header-h")) || 44;
    const status = parseFloat(root.getPropertyValue("--status-h")) || 28;
    return { left: 0, top: header, right: innerWidth, bottom: innerHeight - status };
  }

  function reposition(): void {
    if (!box) return;
    pos = place(kind, anchor.getBoundingClientRect(), { width: box.offsetWidth, height: box.offsetHeight }, contentArea());
  }

  // placed on open, when the content changes height, and when the window resizes
  $effect(() => {
    void height;
    reposition();
  });

  /** Close through the editor so unsaved details are asked about; a stable handle for the opener. */
  export const requestClose = (proceed?: () => void): void => editor?.requestClose(proceed);

  onMount(() => {
    const outside = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (box?.contains(target) || anchor.contains(target)) return;
      editor?.requestClose();
    };
    const keys = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      editor?.escape();
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", keys, true);
    box?.querySelector<HTMLElement>("input, textarea, button, a")?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", keys, true);
      const back = returnFocus ?? anchor;
      if (back.isConnected) back.focus({ preventScroll: true });
    };
  });
</script>

<svelte:window onresize={reposition} />

<div bind:this={box} bind:clientHeight={height} class="fw br" role="dialog" aria-modal="false" aria-label="Edit frequency" style:left="{pos.left}px" style:top="{pos.top}px">
  <FrequencyEditor bind:this={editor} {frequencyId} variant="window" {onclose} {ondone} {openPage} {listenedFeedId} />
</div>

<style>
  .fw {
    position: fixed; z-index: 40; width: var(--inspector-w); max-width: calc(100vw - 32px);
    max-height: calc(100dvh - var(--header-h) - var(--status-h) - 32px);
    display: flex; flex-direction: column; background: var(--bg-raised);
  }
  .fw :global(.fe) { flex: 1 1 auto; height: auto; min-height: 0; }
</style>
