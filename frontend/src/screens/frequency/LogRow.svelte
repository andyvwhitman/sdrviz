<script lang="ts">
  /**
   * One transmission in the log: play control, time, length, transcript (or its state), receiving feed. While it
   * plays, a progress line runs along the bottom of the row. Playback is ink, never orange.
   */
  import * as fmt from "$lib/hud/fmt";
  import { audio } from "$lib/stores/audio.svelte";
  import type { Recording } from "$lib/types/recordings";
  import { clockOf, hasAudio, transcriptKind } from "./frequency";
  import { player } from "./player.svelte";

  interface Props {
    rec: Recording;
    tz: string;
    /** the label for the receiving feed and its tooltip */
    feed: { label: string; title: string };
    selected?: boolean;
    /** inside the bucket the log was jumped to */
    inBucket?: boolean;
    /** the one row that is a tab stop */
    tabbable?: boolean;
    /** the phone row opens to its full transcript on a tap */
    expanded?: boolean;
    ontoggle?: () => void;
    onplay: () => void;
  }
  let { rec, tz, feed, selected = false, inBucket = false, tabbable = false, expanded = false, ontoggle, onplay }: Props = $props();

  const kind = $derived(transcriptKind(rec));
  const playable = $derived(hasAudio(rec));
  const mine = $derived(player.playingId === rec.id);
  const broken = $derived(playable && (player.isFailed(rec.id) || !player.supported));
  const shown = $derived(mine ? player.status : "idle");
  const fraction = $derived(mine && player.duration > 0 ? Math.min(1, player.position / player.duration) : 0);
  const decodeW = $derived(Math.min(Math.round(Math.max(rec.duration_s, 1) * 8), 320));

  const label = $derived(
    !playable ? "Audio expired" : broken ? "Audio unavailable, press to try again" : shown === "playing" ? "Pause" : "Play",
  );

  function seek(event: MouseEvent): void {
    if (!mine) return;
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    player.seek(((event.clientX - box.left) / box.width) * player.duration);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<li
  class="lr"
  class:is-playing={mine}
  class:is-selected={selected}
  class:is-in={inBucket}
  class:is-open={expanded}
  data-rec={rec.id}
  tabindex={tabbable ? 0 : -1}
  aria-label="{clockOf(rec.started_at, tz)}, {rec.duration_s.toFixed(1)} seconds"
>
  {#if selected}<span class="lr__sel" aria-hidden="true"></span>{/if}

  {#if playable}
    <button class="lr__play" type="button" tabindex="-1" aria-label={label} title={broken ? (player.supported ? "Audio unavailable · press to retry" : "This browser cannot play Ogg Opus") : label} onclick={onplay}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        {#if shown === "playing"}
          <path d="M4 3h2v10H4zM10 3h2v10h-2z" fill="var(--ink)" />
        {:else if shown === "paused"}
          <path d="M4 2.5l9 5.5-9 5.5z" fill="var(--ink)" />
        {:else if shown === "loading"}
          <path d="M4 2.5l9 5.5-9 5.5z" fill="none" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 3" />
        {:else if broken}
          <path d="M4 2.5l9 5.5-9 5.5z" fill="none" stroke="var(--state-stale)" stroke-width="1" stroke-dasharray="4 4" />
        {:else}
          <path d="M4 2.5l9 5.5-9 5.5z" fill="none" stroke="var(--line)" stroke-width="1" />
        {/if}
      </svg>
    </button>
  {:else}
    <span class="lr__gone" title="Audio expired · kept 90 days" role="img" aria-label="Audio expired">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="3" y="3" width="10" height="10" fill="none" stroke="var(--state-offline)" stroke-dasharray="1 5" stroke-linecap="round" /></svg>
    </span>
  {/if}

  <span class="lr__time" class:is-ink={mine}>{clockOf(rec.started_at, tz)}</span>
  <span class="lr__len" class:is-ink={mine}>
    {#if mine}{fmt.dur(player.position)} / {fmt.dur(player.duration)}{:else if broken}<span class="lr__tag">{player.supported ? "AUDIO UNAVAILABLE" : "NO OGG OPUS"}</span>{:else}{fmt.dur(rec.duration_s)}{/if}
    {#if mine && audio.muted}<span class="lr__tag lr__tag--2">MUTED</span>{/if}
  </span>

  <span class="lr__text">
    {#if kind === "text"}
      <button class="lr__words" class:is-clamped={!expanded} type="button" tabindex="-1" onclick={ontoggle}>{rec.transcript.trim()}</button>
    {:else if kind === "pending"}
      <span class="lr__bar" style="width: {decodeW}px" aria-hidden="true"></span><span class="lr__tag">PENDING</span>
    {:else if kind === "empty"}
      <span class="lr__tag">NO SPEECH</span>
    {:else}
      <span class="lr__failed">{playable ? "Transcription failed · audio kept." : "Transcription failed."}</span>
    {/if}
  </span>

  <span class="lr__feed" title={feed.title}>{feed.label}</span>

  {#if mine}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="lr__track" onclick={seek}>
      <span class="lr__fill" style="width: {fraction * 100}%"><span class="lr__cap"></span></span>
    </div>
  {/if}
</li>

<style>
  .lr {
    position: relative; display: grid; align-items: start; column-gap: 8px; padding: 6px 0 8px; min-height: 44px;
    border-bottom: 1px solid var(--grid); list-style: none;
    /* scrolled into view, a row stops below the pinned identity and strip, not under them */
    scroll-margin-top: calc(var(--header-h) + var(--fq-top, 0px) + 52px);
    grid-template-columns: 44px auto auto minmax(0, 1fr);
    grid-template-areas: "play time len feed" ". text text text";
  }
  .lr:focus-visible { outline: var(--stroke-emph) solid var(--state-select); outline-offset: -2px; border-radius: 3px; }
  .lr.is-in { box-shadow: inset 2px 0 0 var(--line); }
  .lr__sel {
    position: absolute; inset: -1px -4px; pointer-events: none; --a: 14px; --s: 1.5px;
    background:
      linear-gradient(var(--state-select), var(--state-select)) left top / var(--a) var(--s),
      linear-gradient(var(--state-select), var(--state-select)) left top / var(--s) var(--a),
      linear-gradient(var(--state-select), var(--state-select)) right top / var(--a) var(--s),
      linear-gradient(var(--state-select), var(--state-select)) right top / var(--s) var(--a),
      linear-gradient(var(--state-select), var(--state-select)) left bottom / var(--a) var(--s),
      linear-gradient(var(--state-select), var(--state-select)) left bottom / var(--s) var(--a),
      linear-gradient(var(--state-select), var(--state-select)) right bottom / var(--a) var(--s),
      linear-gradient(var(--state-select), var(--state-select)) right bottom / var(--s) var(--a);
    background-repeat: no-repeat;
  }

  .lr__play, .lr__gone { grid-area: play; display: grid; place-items: center; width: 44px; height: 32px; }
  .lr__gone { cursor: default; }
  .lr__time, .lr__len { font: 400 var(--fs-13)/32px var(--font-data); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .lr__time { grid-area: time; color: var(--ink-2); }
  .lr__len { grid-area: len; color: var(--ink-3); }
  .lr__time.is-ink, .lr__len.is-ink { color: var(--ink); }
  .lr__feed { grid-area: feed; justify-self: end; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 400 var(--fs-12)/32px var(--font-data); color: var(--ink-3); }
  .lr__text { grid-area: text; min-width: 0; padding-right: 4px; }
  .lr__words { display: block; text-align: left; font: 400 var(--fs-15)/1.45 var(--font-read); color: var(--ink); max-width: 72ch; cursor: default; }
  .lr__words.is-clamped { display: -webkit-box; -webkit-line-clamp: 4; line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
  .lr__tag { font: 500 var(--fs-11)/1.4 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink-3); }
  .lr__tag--2 { display: block; line-height: 1; margin-top: -8px; color: var(--ink-2); }
  .lr__failed { font: 400 var(--fs-13)/1.45 var(--font-read); color: var(--ink-3); }
  .lr__bar { display: inline-block; vertical-align: middle; max-width: calc(100% - 80px); height: 1px; margin-right: 8px; background: repeating-linear-gradient(90deg, var(--ink-3) 0 6px, transparent 6px 9px); }

  .lr__track { position: absolute; left: 0; right: 0; bottom: 0; height: 12px; cursor: pointer; }
  .lr__track::before { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 1px; background: var(--line-faint); }
  .lr__fill { position: absolute; left: 0; bottom: 0; height: 2px; background: var(--ink); }
  .lr__cap { position: absolute; right: -3px; bottom: 2px; border: 3px solid transparent; border-top: 5px solid var(--ink); border-bottom: 0; }

  @media (min-width: 900px) {
    .lr { grid-template-columns: 32px 96px 150px minmax(0, 1fr) 88px; grid-template-areas: "play time len text feed"; min-height: 40px; padding: 4px 0 6px; }
    .lr__play, .lr__gone { width: 32px; height: 32px; }
    .lr__time { font-size: var(--fs-12); }
    .lr__len { font-size: var(--fs-12); }
    .lr__text { padding-top: 3px; }
    .lr__feed { font-size: var(--fs-11); }
    .lr__tag--2 { margin-top: -8px; }
  }
</style>
