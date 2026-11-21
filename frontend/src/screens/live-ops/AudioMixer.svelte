<script lang="ts">
  /**
   * The pane's audio row (direction 5.3): volume slider, level meter while keyed, and the same M S levers the tiles
   * carry. Everything goes through the `prefs` store (optimistic, REST-backed); the audio engine reads the same store
   * through `mixer.gainOf`. A line under the row says why a channel cannot be heard, when it cannot.
   */
  import LeverRow from "$lib/components/LeverRow.svelte";
  import LevelMeter from "$lib/components/LevelMeter.svelte";
  import { audio } from "$lib/stores/audio.svelte";
  import { levels } from "$lib/stores/levels.svelte";
  import { prefs } from "$lib/stores/prefs.svelte";
  import { gainOf, LEVER_LIST, volumeOf, volumePatch, volumesOf, type LeverKey, type Mix } from "./mixer";

  interface Props {
    channelId: string;
    floor: number | null;
    keyed: boolean;
    /** the frequency is enabled on another node only: only a solo makes it audible */
    notOnNode?: boolean;
  }
  let { channelId, floor, keyed, notOnNode = false }: Props = $props();

  const mix = $derived<Mix>({ muted: prefs.muted, solo: prefs.solo, volumes: volumesOf(prefs.value) });
  const saved = $derived(Math.round(volumeOf(mix, channelId) * 100));
  /** the slider position while the thumb is being dragged */
  let draft = $state<number | null>(null);
  const shown = $derived(draft ?? saved);
  const level = $derived(levels.last[channelId]);
  const gain = $derived(Math.round(gainOf(mix, channelId) * 100));

  function commit(): void {
    if (draft == null) return;
    const patch = volumePatch(prefs.value, channelId, draft / 100);
    draft = null;
    prefs.update(patch);
  }
  const press = (key: LeverKey) => prefs.toggle(LEVER_LIST[key], channelId);

  /** What the line under the row says, or nothing when it is only the plain gain. */
  const note = $derived.by((): string | null => {
    if (!audio.enabled) return audio.muted ? "AUDIO MUTED · UNMUTE AT THE BOTTOM RIGHT" : "AUDIO STARTS ON YOUR FIRST CLICK";
    if (notOnNode && !prefs.solo.has(channelId)) return "NOT AUDIBLE · NOT ON THE LISTENED NODE · SOLO TO HEAR";
    if (gain === 0) return `NOT AUDIBLE · ${prefs.solo.size && !prefs.solo.has(channelId) ? "ANOTHER CHANNEL IS SOLOED" : "MUTED"}`;
    return null;
  });
</script>

<div class="au">
  <div class="au__row">
    <span class="au__k">AUDIO</span>
    <input
      class="au__slider"
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
    <span class="au__v">{shown}</span>
    {#if keyed}<span class="au__meter"><LevelMeter w={96} db={level?.db ?? null} peak={level?.peak ?? null} {floor} tx muted={prefs.muted.has(channelId)} /></span>{/if}
    <LeverRow class="au__levers" state={{ m: prefs.muted.has(channelId), s: prefs.solo.has(channelId) }} ontoggle={press} />
  </div>
  <p class="au__note">{#if note}{note}{:else}OUTPUT GAIN <span class="au__n">{gain}</span>{/if}</p>
</div>

<style>
  .au { padding: 0 16px; background: var(--bg-void); }
  .au__row { display: flex; align-items: center; gap: 12px; height: var(--pane-row-h, 32px); }
  .au__k { flex: none; font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-3); }
  .au__v { flex: none; min-width: 3ch; text-align: right; font: 400 var(--fs-12)/1 var(--font-data); color: var(--ink-2); }
  .au__meter { flex: none; display: inline-flex; }
  .au__row :global(.au__levers) { flex: none; }
  /* on a phone the levers are 44 px targets */
  .au__row :global(.lever) { width: var(--lever, 24px); height: var(--lever, 24px); }
  .au__row :global(.lever::before) { left: calc(50% - 2px); }
  .au__note { margin: 0; padding-bottom: 6px; font: 500 var(--fs-11)/1.2 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-3); }
  .au__n { font-family: var(--font-data); }

  /* volume slider: a 1 px rail in line-faint, the filled part in line, an 8 x 14 thumb in ink */
  .au__slider { -webkit-appearance: none; appearance: none; flex: 1; min-width: 80px; max-width: 320px; height: var(--pane-row-h, 32px); margin: 0; background: transparent; cursor: pointer; }
  .au__slider::-webkit-slider-runnable-track { height: 1px; background: linear-gradient(90deg, var(--line) var(--fill, 0%), var(--line-faint) var(--fill, 0%)); }
  .au__slider::-moz-range-track { height: 1px; background: var(--line-faint); }
  .au__slider::-moz-range-progress { height: 1px; background: var(--line); }
  .au__slider::-webkit-slider-thumb { -webkit-appearance: none; width: 8px; height: 14px; margin-top: -7px; background: var(--ink); border: 0; border-radius: 0; }
  .au__slider::-moz-range-thumb { width: 8px; height: 14px; background: var(--ink); border: 0; border-radius: 0; }
  .au__slider:focus-visible { outline: 1px solid var(--state-select); outline-offset: 2px; }

  /* a narrow column keeps the slider and the levers; the level meter (the hero already shows the keyed timer) goes first */
  @container pane (max-width: 479px) { .au__slider { flex: 1 1 64px; min-width: 64px; } .au__row { gap: 8px; } }
  @container pane (max-width: 439px) { .au__meter { display: none; } }
</style>
