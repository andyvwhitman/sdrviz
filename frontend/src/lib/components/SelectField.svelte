<script lang="ts">
  /** Underline select in the field vocabulary (spec 5.22). */
  interface Props {
    label: string;
    value: string;
    options: { value: string; text: string }[];
    width?: number;
    error?: string;
  }
  let { label, value = $bindable(), options, width, error }: Props = $props();
</script>

<label class="field" class:is-error={!!error} style:width={width ? `${width}px` : undefined}>
  <span class="field__label">{label}</span>
  <span class="sf__wrap">
    <select class="field__input sf__select" bind:value>
      {#each options as option (option.value)}<option value={option.value}>{option.text}</option>{/each}
    </select>
    <span class="sf__caret" aria-hidden="true">▾</span>
  </span>
  {#if error}<span class="field__error">{error}</span>{/if}
</label>

<style>
  .sf__wrap { position: relative; display: flex; }
  .sf__select { appearance: none; background: transparent; color: var(--ink); font: 400 var(--fs-13)/1 var(--font-data); border-radius: 0; cursor: pointer; width: 100%; padding-right: 14px; }
  .sf__select option { background: var(--bg-raised); color: var(--ink); }
  .sf__caret { position: absolute; right: 0; bottom: 8px; font: 400 var(--fs-11)/1 var(--font-data); color: var(--ink-3); pointer-events: none; }
</style>
