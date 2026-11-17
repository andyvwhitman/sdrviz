<script lang="ts">
  /** One node: name and place, state, link and lag, and the facts the owner checks first. */
  import Button from "$lib/components/Button.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { formatLag, isHighLag } from "$lib/hud/nodes";
  import { hoursLeft } from "$lib/nodeKey";
  import type { SdrNode } from "$lib/types/nodes";
  import LinkMeter from "./LinkMeter.svelte";
  import NodeStatusChip from "./NodeStatusChip.svelte";

  interface Props {
    node: SdrNode;
    /** wall clock in ms, for the "N ago" readings */
    now: number;
    busy?: boolean;
    onrekey: () => void;
    onrevoke: () => void;
  }
  let { node, now, busy = false, onrekey, onrevoke }: Props = $props();

  /** which action is waiting for its confirmation */
  let confirming = $state<"rekey" | "revoke" | null>(null);

  const ago = (iso: string | null): string => (iso ? `${fmt.age((now - Date.parse(iso)) / 1000, "age")} AGO` : fmt.BLANK);
  const place = $derived(`${node.location.lat.toFixed(3)}, ${node.location.lon.toFixed(3)}`);
  const preset = $derived(node.preset === "aar" ? "AAR 07-97" : node.preset.toUpperCase());
  /** hours left on a key; the key may be on a PENDING node or on one that was re-keyed */
  const keyHours = $derived(hoursLeft(node.key_expires_at, now));

  function confirmed(action: () => void): void {
    confirming = null;
    action();
  }
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
    <p class="nd-key t-micro">
      {node.status === "PENDING" ? "WAITING FOR ENROLLMENT" : "NEW KEY ISSUED · THE OLD SECRET WORKS UNTIL THE NEW KEY IS USED"} · KEY EXPIRES IN {keyHours} H
    </p>
  {/if}

  <footer class="st-card__actions">
    {#if confirming === "rekey"}
      <span class="t-micro">RE-KEY {node.name}? A NEW KEY IS SHOWN ONCE.</span>
      <Button sm disabled={busy} onclick={() => confirmed(onrekey)}>CONFIRM RE-KEY</Button>
      <Button sm onclick={() => (confirming = null)}>CANCEL</Button>
    {:else if confirming === "revoke"}
      <span class="t-micro">REVOKE {node.name}? IT IS DISCONNECTED AT ONCE.</span>
      <Button sm disabled={busy} onclick={() => confirmed(onrevoke)}>CONFIRM REVOKE</Button>
      <Button sm onclick={() => (confirming = null)}>CANCEL</Button>
    {:else}
      <Button sm disabled={busy} onclick={() => (confirming = "rekey")}>RE-KEY</Button>
      <span class="grow"></span>
      {#if node.status !== "REVOKED"}<Button sm disabled={busy} onclick={() => (confirming = "revoke")}>REVOKE</Button>{/if}
    {/if}
  </footer>
</article>
