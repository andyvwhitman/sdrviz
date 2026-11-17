<script lang="ts">
  /** One node: name and place, state, link and lag, and the facts the owner checks first. */
  import * as fmt from "$lib/hud/fmt";
  import { formatLag, isHighLag } from "$lib/hud/nodes";
  import type { SdrNode } from "$lib/types/nodes";
  import LinkMeter from "./LinkMeter.svelte";
  import NodeStatusChip from "./NodeStatusChip.svelte";

  interface Props {
    node: SdrNode;
    /** wall clock in ms, for the "N ago" readings */
    now: number;
  }
  let { node, now }: Props = $props();

  const ago = (iso: string | null): string => (iso ? `${fmt.age((now - Date.parse(iso)) / 1000, "age")} AGO` : fmt.BLANK);
  const place = $derived(`${node.location.lat.toFixed(3)}, ${node.location.lon.toFixed(3)}`);
  const preset = $derived(node.preset === "aar" ? "AAR 07-97" : node.preset.toUpperCase());
  /** hours left on a key; the key may be on a PENDING node or on one that was re-keyed */
  const keyHours = $derived(node.key_expires_at ? Math.max(1, Math.ceil((Date.parse(node.key_expires_at) - now) / 3_600_000)) : null);
</script>

<article class="st-card nd-card br" class:is-off={node.status === "OFFLINE" || node.status === "REVOKED"} aria-label={node.name}>
  <header class="st-card__head">
    <span class="st-card__name">{node.name}</span>
    <span class="st-card__kind">NODE {node.number}</span>
    <span class="grow"></span>
    <NodeStatusChip status={node.status} />
  </header>

  <dl class="st-card__meta nd-meta">
    <div><dt>LOCATION</dt><dd class="mono">{place}</dd></div>
    <div><dt>LINK</dt><dd><LinkMeter quality={node.link_quality} /></dd></div>
    <div><dt>LAG</dt><dd class="mono" class:nd-high={isHighLag(node.lag_ms)} title={isHighLag(node.lag_ms) ? "audio is about this far behind the air" : ""}>{formatLag(node.lag_ms)}</dd></div>
    <div><dt>LAST SEEN</dt><dd class="mono">{ago(node.last_seen)}</dd></div>
    <div><dt>AGENT</dt><dd class="mono">{node.agent_version ?? fmt.BLANK}</dd></div>
    <div><dt>PRESET</dt><dd class="mono">{preset}</dd></div>
  </dl>
  {#if keyHours != null}
    <p class="nd-key t-micro">{node.status === "PENDING" ? "WAITING FOR ENROLLMENT" : "NEW KEY ISSUED"} · KEY EXPIRES IN {keyHours} H</p>
  {/if}
</article>
