<script lang="ts">
  /**
   * The frozen-wall statement (brief 9.1.7): the displayed feed is faulted or stale, so the wall
   * holds its last sample. Red glyph and FAULT · <reason> for a fault (the ACK'D suffix is the only
   * change once acknowledged), ink-2 for a stale feed, then the frozen-at clock and the sample age.
   */
  import * as fmt from "$lib/hud/fmt";
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";

  interface Props {
    feedShort: string;
    /** "FAULT · LINK LOST" or "STALE · NO SAMPLES" */
    label: string;
    kind: "fault" | "stale";
    acked: boolean;
    /** sim time of the last sample, seconds of day */
    frozenAt: number;
    sampleAgeS: number | null;
  }
  let { feedShort, label, kind, acked, frozenAt, sampleAgeS }: Props = $props();
</script>

<div class="lo-wallmsg" class:is-stale={kind === "stale"} class:is-acked={acked}>
  <span class="m1">
    <PositionGlyph state={kind === "fault" ? "fault" : "stale"} />
    <span>{feedShort} · {label}{#if acked}<span class="m1a">{" · ACK'D"}</span>{/if}</span>
  </span>
  <span class="m2"><span class="label">FROZEN AT LAST SAMPLE</span> {fmt.clock(frozenAt, "").trim()} · <span class="label">AGE</span> {fmt.age(sampleAgeS, "age")}</span>
</div>
