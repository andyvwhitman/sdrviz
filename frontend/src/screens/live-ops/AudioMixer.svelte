<script lang="ts">
  /**
   * AUDIO section of the channel inspector: volume slider, mute / solo / record toggles and the
   * live level meter. Everything goes through the `prefs` store (optimistic, REST-backed); the audio
   * engine reads the same store through `mixer.gainOf`.
   */
  import LevelMeter from "$lib/components/LevelMeter.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { audio } from "$lib/stores/audio.svelte";
  import { levels } from "$lib/stores/levels.svelte";
  import { prefs } from "$lib/stores/prefs.svelte";
  import { gainOf, LEVER_LIST, volumeOf, volumePatch, volumesOf, type Mix } from "./mixer";

  interface Props {
    channelId: string;
    floor: number | null;
    keyed: boolean;
  }
  let { channelId, floor, keyed }: Props = $props();

  const mix = $derived<Mix>({ muted: prefs.muted, solo: prefs.solo, volumes: volumesOf(prefs.value) });
  const saved = $derived(Math.round(volumeOf(mix, channelId) * 100));
  /** the slider position while the thumb is being dragged */
  let draft = $state<number | null>(null);
  const shown = $derived(draft ?? saved);
  const level = $derived(levels.last[channelId]);

  function commit(): void {
    if (draft == null || !prefs.value) return;
    const patch = volumePatch(prefs.value, channelId, draft / 100);
    draft = null;
    prefs.update(patch).catch((error) => console.warn("volume not saved", error));
  }
  const toggle = (list: (typeof LEVER_LIST)[keyof typeof LEVER_LIST]) =>
    prefs.toggle(list, channelId).catch((error) => console.warn(`${list} not saved`, error));
</script>

<div class="lo-audio">
  <div class="lo-audio__row">
    <span class="lo-audio__k">VOLUME</span>
    <input
      class="lo-slider"
      type="range"
      min="0"
      max="100"
      step="1"
      aria-label="Channel volume"
      value={shown}
      style:--fill="{shown}%"
      oninput={(event) => (draft = event.currentTarget.valueAsNumber)}
      onchange={commit}
    />
    <span class="lo-audio__v mono">{shown}</span>
  </div>
  <div class="lo-audio__row">
    <span class="lo-audio__k">LEVEL</span>
    <LevelMeter w={200} db={keyed ? (level?.db ?? null) : null} peak={keyed ? (level?.peak ?? null) : null} {floor} tx={keyed} muted={prefs.muted.has(channelId)} />
  </div>
  <div class="lo-audio__toggles">
    <Toggle label="MUTE" checked={prefs.muted.has(channelId)} onchange={() => toggle("muted")} />
    <Toggle label="SOLO" checked={prefs.solo.has(channelId)} onchange={() => toggle("solo")} />
    <Toggle label="RECORD" checked={prefs.record.has(channelId)} onchange={() => toggle("record")} />
  </div>
  <span class="t-micro">
    {#if !audio.enabled}AUDIO OFF · ENABLE IT FROM THE HEADER CHIP{:else if gainOf(mix, channelId) === 0}NOT AUDIBLE · {prefs.solo.size ? "ANOTHER CHANNEL IS SOLOED" : "MUTED"}{:else}OUTPUT GAIN <span class="mono">{Math.round(gainOf(mix, channelId) * 100)}</span>{/if}
  </span>
</div>
