<script lang="ts">
  /** Underline field (spec 5.22). */
  interface Props {
    label: string;
    value: string;
    type?: string;
    unit?: string;
    placeholder?: string;
    hint?: string;
    error?: string;
    /** free text rather than a number: proportional font */
    text?: boolean;
    disabled?: boolean;
    readonly?: boolean;
    autofocus?: boolean;
    width?: number;
  }
  let { label, value = $bindable(), type = "text", unit, placeholder, hint, error, text = false, disabled = false, readonly = false, autofocus = false, width }: Props = $props();
</script>

<label class="field" class:is-error={!!error} style:width={width ? `${width}px` : undefined}>
  <span class="field__label">{label}</span>
  <span class="field__row">
    <!-- svelte-ignore a11y_autofocus -->
    <input class="field__input" class:field__input--text={text} {type} bind:value {placeholder} {disabled} {readonly} {autofocus} />
    {#if unit}<span class="field__unit">{unit}</span>{/if}
  </span>
  {#if error}<span class="field__error">{error}</span>{/if}
  {#if hint}<span class="field__hint">{hint}</span>{/if}
</label>

<style>
  .field__row {
    position: relative;
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
</style>
