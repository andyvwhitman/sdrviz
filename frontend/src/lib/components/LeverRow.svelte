<script lang="ts">
  /** M21 lever row: Mute, Solo. (Recording is "enabled", set per node.) */
  type LeverKey = "m" | "s";

  interface Props {
    state?: Partial<Record<LeverKey, boolean>>;
    class?: string;
    ontoggle?: (key: LeverKey) => void;
  }
  let { state = {}, class: className = "", ontoggle }: Props = $props();

  const LEVERS: { letter: string; key: LeverKey; name: string }[] = [
    { letter: "M", key: "m", name: "Mute" },
    { letter: "S", key: "s", name: "Solo" },
  ];

  function press(event: MouseEvent, key: LeverKey) {
    event.stopPropagation(); // a lever press must not select the tile under it
    ontoggle?.(key);
  }
</script>

<span class="levers {className}">
  {#each LEVERS as { letter, key, name }}
    <button class="lever" aria-pressed={!!state[key]} aria-label={name} onclick={(e) => press(e, key)}><b>{letter}</b></button>
  {/each}
</span>
