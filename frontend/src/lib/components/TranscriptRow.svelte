<script lang="ts">
  /**
   * Transcript row (spec 5.12). Takes the scenario row shape (`transcript.rows[]`) and a column set:
   * "log" is Live Ops (time, channel, feed, role, speaker, text); "history" adds AAR, channel name and duration.
   */
  import * as fmt from "$lib/hud/fmt";
  import { speaker } from "$lib/hud/speaker";
  import type { TxRow } from "$lib/types/live";
  import Button from "./Button.svelte";
  import DefectTag from "./DefectTag.svelte";

  interface Props {
    row: TxRow;
    columns?: "log" | "history";
    /** keyed right now: orange channel, tx wash */
    live?: boolean;
    selected?: boolean;
    /** show the play affordance with the duration */
    play?: boolean;
    /** width of the decode bar column in px */
    colWidth?: number;
    onclick?: () => void;
    onretry?: () => void;
  }
  let { row, columns = "log", live = false, selected = false, play = false, colWidth = 320, onclick, onretry }: Props = $props();

  const isDetector = $derived(row.role_tag === "DET");
  const offBank = $derived(row.off_bank);
  const detector = $derived(isDetector ? row.detector : null);

  // a detector row names the train it read
  const who = $derived(
    isDetector
      ? row.train_id
        ? speaker({ train_id: row.train_id })
        : { who: "", full: "" }
      : speaker({ speaker_role: row.role, train_id: row.train_id, speaker: row.speaker }),
  );

  const lowConfidence = (conf: number | null) => conf != null && conf < 0.6;
  const barWidth = $derived(Math.min(Math.round((row.duration_s || 1) * 8), colWidth));
  const detectorFields = $derived(
    detector
      ? [
          { text: detector.mp_label ?? fmt.BLANK },
          detector.defect ? { defect: detector.defect_text || "DEFECT" } : { text: "NO DEFECTS" },
          ...(detector.axles != null ? [{ text: `${detector.axles} AX` }] : []),
          ...(detector.mph != null ? [{ text: `${detector.mph} MPH` }] : []),
        ]
      : [],
  );
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="txrow"
  class:txrow--history={columns === "history"}
  class:is-selected={selected}
  class:has-wash={live && !offBank}
  data-row={row.state}
  data-live={live ? "" : undefined}
  data-offbank={offBank ? "" : undefined}
  data-det={detector ? "" : undefined}
  data-defect={detector?.defect ? "" : undefined}
  data-id={row.id}
  role={onclick ? "button" : undefined}
  tabindex={onclick ? 0 : undefined}
  {onclick}
>
  <span class="sel"></span>
  <span class="c-time">{row.clock.slice(0, 8)}</span>
  {#if columns === "history"}
    <span class="c-aar">{row.aar4}</span>
    <span class="c-chan">{row.label}</span>
  {:else}
    <span class="c-ch">{row.aar}</span>
  {/if}
  <span class="c-feed">{row.feed_label}</span>
  <span class="c-role">{row.role_tag}</span>
  <span class="c-who" title={who.full || undefined}>{who.who}</span>
  {#if columns === "history"}<span class="c-dur">{fmt.dur(row.duration_s)}</span>{/if}
  <span class="c-text">
    {#if !detector && who.who}<span class="who-inline" title={who.full}>{who.who}</span>{/if}
    {#if row.state === "decoding"}
      <span class="decode-bar" style:--bar-w="{barWidth}px"></span><span class="decode-lbl">DECODING</span>
    {:else if row.state === "carrier_only"}
      CARRIER ONLY · {fmt.dur(row.duration_s)}
    {:else if row.state === "no_transcript_decoder_down"}
      No transcript · decoder down.
    {:else if row.state === "failed"}
      Decode failed · audio kept.
      <Button sm onclick={onretry}>RETRY</Button>
    {:else if row.state === "undecodable"}
      Not decoded · non-voice audio.
    {:else if detector}
      {#each detectorFields as field, i}
        {#if i}<span class="sep"></span>{/if}<span class="fld">{#if "defect" in field}<DefectTag /> {field.defect}{:else}{field.text}{/if}</span>
      {/each}
    {:else if row.words.length}
      {#each row.words as word, i}{#if i}{" "}{/if}<span class="w" class:lo={lowConfidence(word.conf)}>{word.w}</span>{/each}
    {:else}
      {row.transcript}
    {/if}
    {#if row.state === "not_recorded"}
      {" "}<span class="not-rec">NOT RECORDED</span>
    {:else if play}
      {" "}<span class="play">▶ {fmt.dur(row.duration_s)}</span>
    {/if}
  </span>
</div>
