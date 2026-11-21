<script lang="ts">
  import Glyph from "$lib/components/Glyph.svelte";
  import "./feeds.css"; // the select caret lives here, and the select is also used on the Settings screen
  /** Underline select in the field vocabulary (spec 5.22): the kit has no select, see docs/requests/feeds-banks.md. */
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
  <span class="fb-select__wrap">
    <select class="field__input fb-select" bind:value>
      {#each options as option}<option value={option.value}>{option.text}</option>{/each}
    </select>
    <span class="fb-select__caret" aria-hidden="true"><Glyph name="chevron-down" /></span>
  </span>
  {#if error}<span class="field__error">{error}</span>{/if}
</label>
