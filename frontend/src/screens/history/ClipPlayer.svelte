<script lang="ts">
  /**
   * Clip player (spec 5.30): the clip's waveform and spectrogram with a playhead, play/pause, seek (click the
   * waveform, arrow keys), speed, loop and an Opus download. Plays GET /api/transmissions/{id}/audio.
   *
   * Keys: space plays and pauses, left/right seek 1 s, j/k step to the next/previous transmission.
   */
  import { untrack } from "svelte";
  import { api } from "$lib/api/client";
  import Button from "$lib/components/Button.svelte";
  import Chip from "$lib/components/Chip.svelte";
  import SimTag from "$lib/components/SimTag.svelte";
  import Waveform from "$lib/components/Waveform.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { feedName } from "$lib/hud/roles";
  import type { HistoryRow, RoutePoint } from "./types";
  import { playbackProgress } from "./playhead";
  import { drawSpectrogram } from "./spectrogram";

  interface Props {
    row: HistoryRow | null;
    point: RoutePoint | null;
    tz: string;
    small: boolean;
    /** a live key-up is on the air: playback ducks it (spec 8.8) */
    keyed: boolean;
    /** 0..1; bindable so the cursors on the stringline and scrubber follow */
    progress?: number;
    playing?: boolean;
    onstep: (delta: number) => void;
  }
  let { row, point, tz, small, keyed, progress = $bindable(0), playing = $bindable(false), onstep }: Props = $props();

  const SPEEDS = [1, 1.5, 2];
  let audio = $state<HTMLAudioElement>();
  let speed = $state(1);
  let loop = $state(false);
  let failed = $state(false);
  let peaks = $state.raw<number[]>([]);
  let vizWidth = $state(0);
  let spectrogram = $state<HTMLCanvasElement>();

  const duration = $derived(row?.duration_s ?? 0);
  const position = $derived(progress * duration);
  const waveH = $derived(small ? 44 : 56);
  const specTop = $derived(waveH + 4);
  const specH = $derived(small ? 48 : 64);
  const rulerY = $derived(specTop + specH);

  // a new clip stops the old one and starts at 0 (the first clip keeps the position the page opened with)
  let shownId: string | undefined;
  $effect(() => {
    const id = row?.id;
    untrack(() => {
      if (shownId !== undefined && id !== shownId) {
        audio?.pause();
        playing = false;
        progress = 0;
        failed = false;
      }
      shownId = id;
    });
  });

  // peaks for the waveform; the bin count follows the width (one bin per 2 px)
  $effect(() => {
    const id = row?.id;
    const bins = Math.min(2000, Math.max(8, Math.floor(vizWidth / 2)));
    if (!id || vizWidth <= 0) return;
    let stale = false;
    api.transmissions.waveform(id, bins).then(
      (wave) => {
        if (!stale) peaks = wave.peaks;
      },
      () => {
        if (!stale) peaks = [];
      },
    );
    return () => {
      stale = true;
    };
  });
  // headroom: the loudest peak reaches 85% of the half-height and always leaves 4 px clear top and bottom
  const envelope = $derived.by((): [number, number][] => {
    const half = waveH / 2;
    const scale = Math.min(0.85, (half - 4) / half) / Math.max(...peaks, 1e-6);
    return peaks.map((p): [number, number] => [-p * scale, p * scale]);
  });

  $effect(() => {
    if (row && spectrogram && vizWidth > 2) drawSpectrogram(spectrogram, row, vizWidth - 2, specH - 2, peaks);
  });

  // the playhead follows the audio clock every frame while playing
  $effect(() => {
    if (!playing || !audio) return;
    let frame = requestAnimationFrame(function tick() {
      if (audio) progress = playbackProgress(audio.currentTime, duration);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });

  async function toggle(): Promise<void> {
    if (!audio || !row) return;
    if (playing) {
      audio.pause();
      return;
    }
    if (progress >= 1) progress = 0;
    audio.currentTime = progress * duration;
    audio.playbackRate = speed;
    try {
      await audio.play();
    } catch {
      failed = true;
    }
  }

  function seek(fraction: number): void {
    progress = Math.min(1, Math.max(0, fraction));
    if (audio) audio.currentTime = progress * duration;
  }

  const seekTo = (event: MouseEvent) => {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    seek((event.clientX - box.left) / box.width);
  };

  function setSpeed(value: number): void {
    speed = value;
    if (audio) audio.playbackRate = value;
  }

  function onended(): void {
    if (loop) {
      seek(0);
      void toggle();
    } else {
      playing = false;
      progress = 1;
    }
  }

  function onkeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
    if (event.key === " " && target.tagName !== "BUTTON") void toggle();
    else if (event.key === "ArrowLeft") seek(progress - 1 / Math.max(1, duration));
    else if (event.key === "ArrowRight") seek(progress + 1 / Math.max(1, duration));
    else if (event.key === "j") onstep(1);
    else if (event.key === "k") onstep(-1);
    else return;
    event.preventDefault();
  }

  const receptions = $derived([...(row?.receptions ?? [])].sort((a, b) => (b.snr_db ?? 0) - (a.snr_db ?? 0)));
  const mpText = $derived(point ? point.mp_label.replace("≈", "≈ ") : fmt.BLANK);
  const rulerStep = $derived(duration > 8 ? 2 : duration > 4 ? 1 : 0.5);
  const ticks = $derived.by(() => {
    const out: { x: number; major: boolean; label: string | null }[] = [];
    if (duration <= 0 || vizWidth <= 0) return out;
    for (let t = 0; t <= duration + 1e-6; t += rulerStep / 2) {
      const x = Math.min(vizWidth - 1, (t / duration) * vizWidth);
      const major = Math.abs(t / rulerStep - Math.round(t / rulerStep)) < 1e-6;
      out.push({ x, major, label: major && t > 0 && x < vizWidth - 24 ? `${t.toFixed(t % 1 ? 1 : 0)} S` : null });
    }
    return out;
  });
  const snap = (v: number) => Math.round(v) + 0.5;
  const playheadX = $derived(Math.round(progress * (vizWidth - 2)) + 1);
</script>

<svelte:window {onkeydown} />

{#if !row}
  <div class="empty">
    <div class="t-panel">NO CLIP SELECTED</div>
    <div class="t-body">Click a tick or a row to load its clip.</div>
  </div>
{:else}
  <audio bind:this={audio} src={api.transmissions.audioUrl(row.id)} preload="none" {onended} onplay={() => (playing = true)} onpause={() => (playing = false)} onerror={() => (failed = true)}></audio>
  <div class="hi-phead">
    <span class="t-panel">CLIP</span><span class="mono">{row.clock_tenths} {tz}</span>
    <span class="t-label">{row.aar} · {row.label}</span>
    <span class="aside">
      {#if playing && keyed}<span class="hi-duck">LIVE AUDIO DUCKED −18 dB</span>{/if}
      {#if row.sim}<SimTag />{:else}<span class="t-micro">SEED</span>{/if}
    </span>
  </div>
  <div class="hi-pmeta">
    <span><span class="k">TRAIN</span>{fmt.trainId(row.train_id || row.speaker)}</span>
    <span><span class="k">MP</span>{mpText}</span>
    <span>
      <span class="k">RX</span>{#each receptions as rx, i}{#if i}{" · "}{/if}<span class:pri={i === 0}>{feedName(rx.feed_id)} {fmt.snr(rx.snr_db).replace("SNR ", "")}</span>{/each}
    </span>
    <span class="hi-prole"><span class="k">ROLE</span>{row.role_tag}</span>
  </div>
  <div class="hi-pviz" bind:clientWidth={vizWidth}>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="bezel hi-wave" onclick={seekTo}>
      {#if vizWidth > 0 && envelope.length}<Waveform env={envelope} width={vizWidth} height={waveH} />{/if}
    </div>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="bezel hi-spec" onclick={seekTo}><canvas bind:this={spectrogram} style="left:1px;top:1px"></canvas></div>
    {#if vizWidth > 0}
      <svg class="hud hi-pover" width={vizWidth} height={rulerY + 28} aria-hidden="true">
        <path class="s-hair k-faint" d="M0 {snap(rulerY)}L{vizWidth} {snap(rulerY)}" />
        {#each ticks as tick}
          <path class="s-hair {tick.major ? 'k-line' : 'k-faint'}" d="M{snap(tick.x)} {rulerY}L{snap(tick.x)} {rulerY + (tick.major ? 8 : 4)}" />
          {#if tick.label}<text class="tx-num" x={Math.round(tick.x)} y={rulerY + 20} text-anchor="middle">{tick.label}</text>{/if}
        {/each}
        <path class="hi-playhead" d="M{playheadX} 0L{playheadX} {rulerY}" />
        <path class="hi-cap" d="M{playheadX - 5} -6H{playheadX + 5}L{playheadX} 0Z" />
        <!-- axis labels sit above the playhead, inset past the cap, with a void knockout so they always read -->
        <text class="tx-lab hi-axis" x="14" y={specTop + 14}>4 KHZ</text>
        <text class="tx-lab hi-axis" x="14" y={rulerY - 4}>0</text>
      </svg>
    {/if}
  </div>
  <div class="hi-ptext">
    {#if failed}
      <span class="meta">AUDIO UNAVAILABLE</span>
    {:else if row.words.length}
      {#each row.words as word, i}{#if i}{" "}{/if}<span class:lo={(word.conf ?? 1) < 0.6}>{word.w}</span>{/each}
    {:else}
      <span class="meta">{row.state.toUpperCase().replace(/_/g, " ")}</span>
    {/if}
  </div>
  <div class="hi-pctl">
    <Button onclick={() => onstep(-1)}>◂◂</Button>
    <Button primary onclick={toggle}>{playing ? "❚❚ PAUSE" : "▶ PLAY"}</Button>
    <Button onclick={() => onstep(1)}>▸▸</Button>
    <span class="hi-speed">
      {#each SPEEDS as s}<Chip kind="filter" button pressed={speed === s} onclick={() => setSpeed(s)} text="{s}×" />{/each}
    </span>
    <span class="hi-loop"><Chip kind="filter" button pressed={loop} onclick={() => (loop = !loop)} text="LOOP" /></span>
    <span class="hi-pos">{fmt.dur(position)} <span class="of">/ {fmt.dur(duration)}</span></span>
    <a href={api.transmissions.audioUrl(row.id)} download="{row.id}.webm">Opus ↓</a>
  </div>
{/if}
