<script lang="ts">
  /** Defect-detector reports: one cell per detector with its last reading and a DEFECT tag when any. */
  import DefectTag from "$lib/components/DefectTag.svelte";
  import MilepostTag from "$lib/components/MilepostTag.svelte";
  import { BLANK } from "$lib/hud/fmt";
  import type { StatsView } from "./types";

  interface Props {
    stats: StatsView;
    rangeLabel: string;
    compact: boolean;
  }
  let { stats, rangeLabel, compact }: Props = $props();

  const detectors = $derived(stats.detectors);
  const reports = $derived(detectors.reduce((a, d) => a + d.reports, 0));
  const defects = $derived(detectors.reduce((a, d) => a + d.defects, 0));
  const shortName = (name: string) => name.replace(/\s*defect detector$/i, "").replace(/^CSX detector\s*/i, "");
</script>

<div class="panel__head">
  <span class="t-panel">DETECTOR BOARD</span>
  <span class="t-micro">
    <b>{detectors.length}</b> DETECTORS · <b>{reports}</b> REPORTS · <b>{defects}</b> DEFECT{defects === 1 ? "" : "S"} · {rangeLabel}
  </span>
</div>
<div class="st-dgrid">
  {#each detectors as d (d.detector_id)}
    <div class="st-dcell" data-defect={d.defects ? "" : undefined}>
      <MilepostTag mp={d.mp_label} />
      <div>
        <div class="nm">{shortName(d.name)}</div>
        <div class="ln">
          <span class="k">LAST</span>{#if d.last}{compact ? d.last.clock.slice(0, 5) : d.last.clock} · {d.last.axles} AX · {d.last.mph} MPH{:else}<span class="z">{BLANK} NO REPORT</span>{/if}
        </div>
        <div class="ln">
          <span class="k">RPT</span>{d.reports}<span class="z">{" · "}</span>{#if d.defects > 0}<DefectTag /><span class="mono">{d.defects}</span>{:else}<span class="z">0 DEFECTS</span>{/if}
        </div>
      </div>
    </div>
  {/each}
</div>
