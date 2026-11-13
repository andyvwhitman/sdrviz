<script lang="ts">
  /** One M21 lever with its AAR number above (banks admin). `status` adds the tx, stale and off frames. */
  interface Props {
    letter: string;
    on?: boolean;
    aar?: string | null;
    status?: "tx" | "stale" | "off";
    label?: string;
    onclick?: () => void;
  }
  let { letter, on = false, aar = null, status, label, onclick }: Props = $props();
</script>

<span class="lever-wrap" class:is-tx={status === "tx"} class:is-stale={status === "stale"} class:is-off={status === "off"}>
  {#if aar != null}<span class="lever-aar">{aar}</span>{/if}
  <button class="lever" aria-pressed={on} aria-label={label} {onclick}><b>{letter}</b></button>
</span>
