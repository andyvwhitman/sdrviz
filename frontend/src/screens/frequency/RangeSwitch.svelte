<script lang="ts">
  /** The phone's range switch: one instrument slot, two ranges (the day strip or the week grid). */
  interface Props {
    range: "day" | "week";
    /** "TODAY", or the date of the day being shown */
    dayLabel: string;
    onrange: (range: "day" | "week") => void;
  }
  let { range, dayLabel, onrange }: Props = $props();
</script>

<div class="tabs rs" role="tablist" aria-label="Range">
  <button class="tab" role="tab" type="button" aria-selected={range === "day"} onclick={() => onrange("day")}>{dayLabel}</button>
  <button class="tab" role="tab" type="button" aria-selected={range === "week"} onclick={() => onrange("week")}>7 DAYS</button>
</div>

<style>
  .rs { height: 32px; --tabs-h: 32px; }
  .rs .tab { height: 32px; min-width: 64px; }
</style>
