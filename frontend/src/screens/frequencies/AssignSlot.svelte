<script lang="ts">
  /**
   * One node's slot for one frequency (direction 2.4): ON, OFF or nothing. A switch for an admin, a plain span for a
   * viewer. An unassigned slot shows a ghost `+ ADD` while its row is hovered or focused.
   */
  import type { NodeColumn, Slot } from "$lib/types/frequencies";

  interface Props {
    slot: Slot;
    /** "SDR-01, 5454 AMTK NEC" */
    name: string;
    nodeState: NodeColumn["state"];
    readonly?: boolean;
    busy?: boolean;
    onflip: () => void;
  }
  let { slot, name, nodeState, readonly = false, busy = false, onflip }: Props = $props();

  const word = $derived(slot === "on" ? "enabled" : slot === "off" ? "disabled" : "not assigned");
  /** enabled, but the node is not being heard: the frame is dashed */
  const unheard = $derived(slot === "on" && nodeState !== "ok");
</script>

{#snippet face()}
  {#if slot === "none"}
    <span class="as__dash">—</span><span class="as__ghost">+ ADD</span>
  {:else}
    <i class="as__box" class:is-on={slot === "on"}></i><span class="as__word">{slot === "on" ? "ON" : "OFF"}</span>
  {/if}
{/snippet}

{#if readonly}
  <span class="as is-{slot}" class:is-unheard={unheard} role="img" aria-label="{name}, {word}">{@render face()}</span>
{:else}
  <button class="as is-{slot}" class:is-unheard={unheard} class:is-busy={busy} type="button" role="switch" aria-checked={slot === "on"} aria-label="{name}, {word}" disabled={busy} onclick={(event) => (event.stopPropagation(), onflip())}>
    {@render face()}
  </button>
{/if}

<style>
  .as {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: 64px; height: 28px; padding: 0; background: none; border: 0;
    font: 600 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-3); cursor: pointer;
    box-shadow: inset 0 0 0 1px transparent; transition: color var(--t-micro) var(--ease-instrument);
  }
  span.as { cursor: default; }
  .as.is-on { color: var(--ink); box-shadow: inset 0 0 0 1px var(--line); }
  .as.is-off { box-shadow: inset 0 0 0 1px var(--line-faint); }
  .as.is-on.is-unheard { box-shadow: none; border: 1px dashed var(--state-stale); }
  .as.is-busy { color: var(--ink-2); cursor: default; }
  .as__box { width: 16px; height: 16px; box-shadow: inset 0 0 0 1px var(--line-faint); display: grid; place-items: center; flex: none; }
  .as__box.is-on { box-shadow: inset 0 0 0 1px var(--line); }
  .as__box.is-on::after { content: ""; width: 8px; height: 8px; background: var(--state-idle); }
  .as__ghost { display: none; }
  /* the ghost shows on row hover or focus, on a button only */
  :global(.fr-row:hover) button.as.is-none, :global(.fr-row:focus-within) button.as.is-none { box-shadow: inset 0 0 0 1px var(--line-faint); color: var(--ink-2); }
  :global(.fr-row:hover) button.as.is-none .as__dash, :global(.fr-row:focus-within) button.as.is-none .as__dash { display: none; }
  :global(.fr-row:hover) button.as.is-none .as__ghost, :global(.fr-row:focus-within) button.as.is-none .as__ghost { display: inline; }
  button.as:hover:not(:disabled) { color: var(--ink); }
  button.as:focus-visible { outline: var(--stroke-emph) solid var(--state-select); outline-offset: 2px; }
</style>
