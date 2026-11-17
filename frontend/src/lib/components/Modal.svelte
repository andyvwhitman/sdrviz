<script lang="ts">
  /** A centred dialog over a dimmed page. Escape or a click outside asks to close; the owner decides what that does. */
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";

  interface Props {
    title: string;
    onclose: () => void;
    children: Snippet;
  }
  let { title, onclose, children }: Props = $props();

  let dialog = $state<HTMLElement>();
  onMount(() => dialog?.focus());
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onclose()} />

<div class="md-back" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="md br" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" bind:this={dialog}>
    <h2 class="md__title">{title}</h2>
    {@render children()}
  </div>
</div>

<style>
  .md-back { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px; background: rgb(0 0 0 / 0.6); }
  .md { position: relative; width: min(640px, 100%); max-height: 100%; overflow-y: auto; padding: 20px 24px 22px; background: var(--bg-raised); outline: none; display: flex; flex-direction: column; gap: 14px; }
  .md__title { margin: 0; font: var(--type-title); letter-spacing: var(--track-title); text-transform: uppercase; color: var(--ink); }
</style>
