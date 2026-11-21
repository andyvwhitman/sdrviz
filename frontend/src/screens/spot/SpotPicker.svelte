<script lang="ts">
  /**
   * Where am I standing: my location, a station by name, or typed coordinates, plus the last few spots and the
   * high-contrast switch. Denied or missing geolocation is a state with the other choices in reach, never a dead end.
   */
  import { onMount } from "svelte";
  import { displayName } from "$lib/displayName";
  import type { Stop } from "$lib/types/transit";
  import { parseLatLon, searchStops } from "./spot";
  import type { LocateStatus, Spot } from "./spot.svelte";

  interface Props {
    stops: Stop[];
    recent: Spot[];
    locate: LocateStatus;
    contrast: boolean;
    /** part of the page flow instead of a floating sheet (the first run, with no spot yet) */
    inline?: boolean;
    onlocate: () => void;
    onpick: (spot: Spot) => void;
    oncontrast: (on: boolean) => void;
    onclose: () => void;
  }
  let { stops, recent, locate, contrast, inline = false, onlocate, onpick, oncontrast, onclose }: Props = $props();

  let text = $state("");
  let input: HTMLInputElement | undefined;
  onMount(() => input?.focus());

  const typed = $derived(parseLatLon(text));
  const found = $derived(typed ? [] : searchStops(stops, text));
  const where = (s: Spot): string => s.name ?? `${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}`;

  const pickStop = (stop: Stop): void => onpick({ lat: stop.lat, lon: stop.lon, source: "station", name: displayName(stop) });
  function pickTyped(): void {
    if (typed) onpick({ ...typed, source: "typed" });
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (typed) pickTyped();
    else if (found[0]) pickStop(found[0]);
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onclose()} />

<div class="pk br br--line" class:pk--inline={inline} role="dialog" aria-label="Choose a spot">
  <button class="pk__btn pk__btn--primary" type="button" onclick={onlocate}>
    {locate === "locating" ? "LOCATING…" : "USE MY LOCATION"}
  </button>
  {#if locate === "denied"}
    <p class="pk__note">LOCATION BLOCKED · PICK A STATION</p>
  {:else if locate === "unavailable"}
    <p class="pk__note">LOCATION UNAVAILABLE · PICK A STATION</p>
  {:else}
    <p class="pk__note pk__note--quiet">USE MY LOCATION TO TIME TRAINS TO THIS SPOT</p>
  {/if}

  <form onsubmit={submit}>
    <label class="pk__label" for="spot-q">STATION OR LAT, LON</label>
    <input
      id="spot-q"
      class="pk__input"
      bind:this={input}
      bind:value={text}
      placeholder="odenton, or 39.0869, -76.7065"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      enterkeyhint="go"
    />
  </form>

  <ul class="pk__list">
    {#if typed}
      <li><button type="button" onclick={pickTyped}><span>USE {typed.lat}, {typed.lon}</span></button></li>
    {/if}
    {#each found as stop (stop.id)}
      <li><button type="button" onclick={() => pickStop(stop)}><span>{displayName(stop)}</span><em>{stop.id.startsWith("st:") ? "STATION" : stop.source.toUpperCase()}</em></button></li>
    {/each}
    {#if text && !typed && !found.length}
      <li class="pk__none">{stops.length ? "NO STATION BY THAT NAME" : "STATIONS NOT LOADED · TYPE LAT, LON"}</li>
    {/if}
  </ul>

  {#if recent.length && !text}
    <p class="pk__label">RECENT</p>
    <ul class="pk__list">
      {#each recent as spot (`${spot.lat},${spot.lon}`)}
        <li><button type="button" onclick={() => onpick(spot)}><span>{where(spot)}</span></button></li>
      {/each}
    </ul>
  {/if}

  <label class="pk__switch">
    <input type="checkbox" checked={contrast} onchange={(e) => oncontrast(e.currentTarget.checked)} />
    <span>HIGH CONTRAST</span>
  </label>
</div>

<style>
  .pk { position: absolute; z-index: 30; left: 0; right: 0; top: 100%; display: grid; gap: 8px; padding: 16px; background: var(--bg-raised); max-height: 70vh; overflow: auto; }
  .pk__btn {
    min-height: 44px; padding: 0 16px; font: 600 var(--fs-12)/1 var(--font-label); letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--ink); box-shadow: inset 0 0 0 1px var(--line); text-align: center;
  }
  .pk__note { margin: 0; font: 500 var(--fs-13)/1.3 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); text-transform: uppercase; }
  .pk__note--quiet { font-size: var(--fs-11); color: var(--ink-3); }
  .pk__label { margin: 8px 0 0; font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); display: block; }
  .pk__input {
    width: 100%; min-height: 44px; margin-top: 6px; padding: 0 12px; border: 0; background: var(--bg-void); color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--line-faint); font: 400 16px/1 var(--font-data); /* 16 px: iOS does not zoom the page on focus */
  }
  .pk__input:focus { box-shadow: inset 0 0 0 1px var(--state-select); }
  .pk__list { list-style: none; margin: 0; padding: 0; display: grid; }
  .pk__list button, .pk__none { display: flex; justify-content: space-between; gap: 12px; width: 100%; min-height: 44px; align-items: center; padding: 0 4px; text-align: left; border-bottom: 1px solid var(--grid); font: 500 var(--fs-13)/1.2 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink); }
  .pk__list button:hover { background: var(--bg-panel); }
  .pk__list em { font: 400 var(--fs-11) var(--font-label); font-style: normal; color: var(--ink-2); }
  .pk__none { color: var(--ink-2); }
  .pk__switch { display: flex; align-items: center; gap: 10px; min-height: 44px; font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink); cursor: pointer; }
  .pk__switch input {
    appearance: none; width: 20px; height: 20px; margin: 0; display: grid; place-items: center; background: none;
    box-shadow: inset 0 0 0 1px var(--line-faint);
  }
  .pk__switch input:checked { box-shadow: inset 0 0 0 1px var(--line); }
  .pk__switch input:checked::after { content: ""; width: 10px; height: 10px; background: var(--ink); }
  @media (min-width: 900px) { .pk { left: auto; right: var(--margin-x); width: 420px; } }
  /* the first run: the sheet is part of the page and pushes the rest down */
  .pk.pk--inline { position: static; width: auto; max-height: none; box-shadow: none; }
</style>
