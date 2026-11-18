<script lang="ts">
  /** A MiniStrip that fetches today's activity for one frequency (the Live Ops inspector). Refreshes on the minute. */
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import type { DayActivity } from "$lib/types/recordings";
  import MiniStrip from "./MiniStrip.svelte";

  interface Props {
    frequencyId: string;
    label: string;
    keyed?: boolean;
    lastS?: number | null;
  }
  let { frequencyId, label, keyed = false, lastS = null }: Props = $props();

  let day = $state<DayActivity | null>(null);
  let nowMs = $state(Date.now());

  async function load(id: string): Promise<void> {
    try {
      day = await api.activity.day(id);
    } catch {
      // the strip stays as it was; the page itself tells about errors
    }
  }

  $effect(() => {
    day = null;
    void load(frequencyId);
  });
  onMount(() => {
    const timer = setInterval(() => {
      nowMs = Date.now();
      if (nowMs % 60_000 < 1000) void load(frequencyId);
    }, 1000);
    return () => clearInterval(timer);
  });
</script>

{#if day}
  <MiniStrip buckets={day.buckets} recordingSince={day.recording_since} {nowMs} {keyed} {lastS} href="/frequency/{frequencyId}" {label} />
{/if}
