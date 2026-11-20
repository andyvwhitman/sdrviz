<script lang="ts">
  /** The 3-way control of one node: unassigned, assigned but off, enabled. Chips in a radio group. */
  import type { Slot } from "$lib/types/frequencies";

  interface Props {
    value: Slot;
    label: string;
    disabled?: boolean;
    onpick: (slot: Slot) => void;
  }
  let { value, label, disabled = false, onpick }: Props = $props();

  const CHOICES: { slot: Slot; text: string; name: string }[] = [
    { slot: "none", text: "—", name: "not assigned" },
    { slot: "off", text: "OFF", name: "disabled" },
    { slot: "on", text: "ON", name: "enabled" },
  ];
</script>

<div class="ss" role="radiogroup" aria-label={label}>
  {#each CHOICES as choice (choice.slot)}
    <button
      class="ss__b"
      class:is-on={value === choice.slot}
      class:is-enabled={value === choice.slot && choice.slot === "on"}
      type="button"
      role="radio"
      aria-checked={value === choice.slot}
      aria-label={choice.name}
      {disabled}
      onclick={() => value !== choice.slot && onpick(choice.slot)}>{choice.text}</button
    >
  {/each}
</div>

<style>
  .ss { display: inline-flex; flex: none; }
  .ss__b {
    min-width: 48px; height: 32px; padding: 0 10px; background: none; border: 1px solid var(--line-faint); margin-left: -1px;
    font: 600 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-3); cursor: pointer;
    transition: color var(--t-micro) var(--ease-instrument);
  }
  .ss__b:first-child { margin-left: 0; }
  .ss__b:hover:not(:disabled) { color: var(--ink); }
  .ss__b.is-on { color: var(--ink); border-color: var(--line); position: relative; z-index: 1; }
  .ss__b.is-enabled { color: var(--state-idle); }
  .ss__b:disabled { color: var(--ink-2); cursor: default; }
  :global(.fe--layer) .ss__b { height: 44px; min-width: 56px; font-size: var(--fs-13); }
</style>
