<script lang="ts">
  /** A filter chip with a dropdown: shows `NAME ▾`, or `NAME value ×` when a value is set. */
  import Chip from "$lib/components/Chip.svelte";

  interface Option {
    value: string;
    label: string;
  }
  interface Props {
    name: string;
    options: Option[];
    value: string;
    onchange: (value: string) => void;
  }
  let { name, options, value, onchange }: Props = $props();

  let open = $state(false);
  const current = $derived(options.find((o) => o.value === value));

  function pick(next: string): void {
    open = false;
    onchange(next);
  }
</script>

<svelte:window onclick={() => (open = false)} />

<span class="hi-filter">
  <Chip kind="filter" button pressed={!!current} onclick={(event) => { event.stopPropagation(); open = !open; }}>
    {name}{#if current}<span class="v">{current.label} ×</span>{:else}{" "}▾{/if}
  </Chip>
  {#if open}
    <ul class="hi-menu bezel" role="listbox">
      <li><button role="option" aria-selected={!current} onclick={() => pick("")}>ANY</button></li>
      {#each options as option (option.value)}
        <li><button role="option" aria-selected={option.value === value} onclick={() => pick(option.value)}>{option.label}</button></li>
      {/each}
    </ul>
  {/if}
</span>
