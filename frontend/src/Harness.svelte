<script lang="ts">
  import { live } from "$lib/stores/live.svelte";
  import { audio } from "$lib/stores/audio.svelte";
  import { router } from "$lib/router.svelte";
  import FrontWall from "./screens/live-ops/FrontWall.svelte";
  const snap = $derived(live.state);
  const feed = $derived(snap ? (snap.feeds.find((f) => f.id === snap.listen_feed) ?? snap.feeds[0]) : null);
  import { connect } from "$lib/ws/connection";
  import { onMount } from "svelte";
  onMount(() => connect());
  void audio;
</script>
{#if snap && feed}
  <div class="lo" style="width:1200px;height:700px;container-type:size;display:flex;flex-direction:column;position:relative">
    <FrontWall state={snap} bankChannels={snap.channels.map((c) => Number(c.aar.replace(/\D/g, "")))} dropAge={null} {feed} />
  </div>
  <div id="sel">{router.query("select")}</div>
{/if}
