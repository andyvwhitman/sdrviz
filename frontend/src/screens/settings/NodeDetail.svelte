<script lang="ts">
  /**
   * One node's health: link and lag over the last 30 minutes, the facts from its last health report, its recent
   * events, and the commands it understands, each showing the node's answer. Red is only for a real fault.
   */
  import { onMount } from "svelte";
  import Button from "$lib/components/Button.svelte";
  import Field from "$lib/components/Field.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import { ApiError } from "$lib/api/client";
  import { nodesApi } from "$lib/api/nodes";
  import * as fmt from "$lib/hud/fmt";
  import { formatLag } from "$lib/hud/nodes";
  import { commandText, eventTime, nodeFaults, reconnectsLastHour } from "$lib/nodeHealth";
  import { nodesStore, NODES_POLL_MS } from "$lib/stores/nodes.svelte";
  import type { CommandResult, NodeCommand, NodeDetail, SdrNode } from "$lib/types/nodes";
  import LinkMeter from "./LinkMeter.svelte";
  import NodeStatusChip from "./NodeStatusChip.svelte";
  import TrendLine from "./TrendLine.svelte";

  interface Props {
    node: SdrNode;
    onclose: () => void;
  }
  let { node: opened, onclose }: Props = $props();

  const EVENT_ROWS = 20;

  let detail = $state.raw<NodeDetail | null>(null);
  let now = $state(Date.now());
  let gain = $state("");
  let squelch = $state("");
  let busy = $state(false);
  let confirmRestart = $state(false);
  /** the last answer to each command type */
  let answers = $state<Partial<Record<NodeCommand["type"], string>>>({});

  // The list poll keeps the live numbers fresh; the detail adds the events.
  const node = $derived(nodesStore.nodes.find((n) => n.id === opened.id) ?? opened);
  const health = $derived(detail?.health ?? node.health);
  const faults = $derived(nodeFaults(health));
  const points = (pick: "link" | "lag"): [number, number | null][] => (nodesStore.history[opened.id] ?? []).map((s) => [s.t, s[pick]]);
  const events = $derived((detail?.events ?? []).slice(0, EVENT_ROWS));
  const online = $derived(node.status === "ONLINE");

  async function load(): Promise<void> {
    try {
      detail = await nodesApi.get(opened.id);
    } catch {
      // the list poll still shows the numbers; the events just stay as they were
    }
  }

  onMount(() => {
    void load();
    const poll = setInterval(() => void load(), NODES_POLL_MS);
    const clock = setInterval(() => (now = Date.now()), 1000);
    return () => [poll, clock].forEach(clearInterval);
  });

  async function send(command: NodeCommand): Promise<void> {
    busy = true;
    answers[command.type] = "SENDING…";
    try {
      const result: CommandResult = await nodesApi.command(opened.id, command);
      answers[command.type] = commandText(result);
    } catch (error) {
      answers[command.type] = `FAILED · ${error instanceof ApiError ? error.message : "Backend unreachable"}`;
    } finally {
      busy = false;
      void load();
    }
  }

  function restart(): void {
    confirmRestart = false;
    void send({ type: "restart" });
  }

  const sendNumber = (type: "gain" | "squelch", text: string): void => {
    const value = Number(text);
    if (text.trim() === "" || !Number.isFinite(value)) answers[type] = "ENTER A NUMBER";
    else void send(type === "gain" ? { type, gain_db: value } : { type, squelch_db: value });
  };

  const num = (value: number | null | undefined, unit = ""): string => (value == null ? fmt.BLANK : `${value}${unit}`);
</script>

<Modal title="NODE HEALTH · {node.name}" {onclose} wide>
  <div class="nh-top">
    <NodeStatusChip status={node.status} />
    <span class="t-micro">NODE {node.number} · AGENT {node.agent_version ?? fmt.BLANK}</span>
    <span class="grow"></span>
    <Button sm onclick={onclose}>CLOSE</Button>
  </div>

  {#if faults.length}<p class="nh-fault" role="alert">{faults.join(" · ")}</p>{/if}

  <div class="nh-trends">
    <section>
      <header class="st-h"><span>LINK QUALITY · 30 MIN</span><span class="grow"></span><LinkMeter quality={node.link_quality} /></header>
      <TrendLine points={points("link")} max={100} {now} label="Link quality, last 30 minutes" />
    </section>
    <section>
      <header class="st-h"><span>LAG · 30 MIN</span><span class="grow"></span><span class="mono">{formatLag(node.lag_ms)}</span></header>
      <TrendLine points={points("lag")} max={3000} {now} label="Lag, last 30 minutes" />
    </section>
  </div>

  <dl class="st-card__meta nh-facts">
    <div><dt>CPU</dt><dd class="mono">{num(health?.cpu_pct, " %")}</dd></div>
    <div><dt>TEMPERATURE</dt><dd class="mono">{num(health?.temp_c, " C")}</dd></div>
    <div><dt>RTL_TCP</dt><dd class="mono">{health ? health.rtl_tcp.toUpperCase() : fmt.BLANK}</dd></div>
    <div><dt>DROPPED BLOCKS</dt><dd class="mono">{num(health?.dropped_blocks)}</dd></div>
    <div><dt>RECONNECTS · 1 H</dt><dd class="mono">{detail ? reconnectsLastHour(detail.events, now) : fmt.BLANK}</dd></div>
    <div><dt>AUDIO AGE</dt><dd class="mono">{num(health?.audio_age_ms, " ms")}</dd></div>
    <div><dt>GAIN</dt><dd class="mono">{health ? (health.tune.gain_db == null ? "AUTO" : `${health.tune.gain_db} dB`) : fmt.BLANK}</dd></div>
    <div><dt>SQUELCH</dt><dd class="mono">{num(health?.tune.squelch_db, " dB")}</dd></div>
  </dl>

  <section>
    <header class="st-h"><span>COMMANDS</span>{#if !online}<span class="t-micro">NODE IS NOT ONLINE</span>{/if}</header>
    <div class="nh-cmds">
      <div class="nh-cmd">
        <Field label="GAIN" bind:value={gain} unit="dB" disabled={!online} />
        <Button sm disabled={!online || busy} onclick={() => sendNumber("gain", gain)}>SET GAIN</Button>
        <Button sm disabled={!online || busy} onclick={() => send({ type: "gain", gain_db: null })}>AUTO</Button>
        <span class="t-micro nh-ans">{answers.gain ?? ""}</span>
      </div>
      <div class="nh-cmd">
        <Field label="SQUELCH" bind:value={squelch} unit="dB" disabled={!online} />
        <Button sm disabled={!online || busy} onclick={() => sendNumber("squelch", squelch)}>SET SQUELCH</Button>
        <span class="t-micro nh-ans">{answers.squelch ?? ""}</span>
      </div>
      <div class="nh-cmd">
        {#if confirmRestart}
          <span class="t-micro">RESTART THE AGENT? IT RECONNECTS ITSELF.</span>
          <Button sm disabled={busy} onclick={restart}>CONFIRM RESTART</Button>
          <Button sm onclick={() => (confirmRestart = false)}>CANCEL</Button>
        {:else}
          <Button sm disabled={!online || busy} onclick={() => (confirmRestart = true)}>RESTART AGENT</Button>
        {/if}
        <span class="t-micro nh-ans">{answers.restart ?? ""}</span>
      </div>
    </div>
  </section>

  <section>
    <header class="st-h"><span>EVENTS · LAST {EVENT_ROWS}</span></header>
    {#if events.length}
      <ul class="nh-events">
        {#each events as e (e.t + e.kind + e.detail)}
          <li><span class="mono">{eventTime(e.t)}</span><span class="nh-kind">{e.kind.toUpperCase()}</span><span>{e.detail}</span></li>
        {/each}
      </ul>
    {:else}
      <p class="t-micro">NO EVENTS YET</p>
    {/if}
  </section>
</Modal>

<style>
  .nh-top { display: flex; align-items: center; gap: 12px; }
  .grow { flex: 1; }
  .nh-fault { margin: 0; padding: 8px 12px; font: var(--type-name); letter-spacing: var(--track-name); color: var(--state-fault); background: var(--wash-fault); }
  .nh-trends { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px 24px; }
  .nh-facts { margin: 0; }
  .nh-cmds { display: grid; gap: 10px; }
  .nh-cmd { display: flex; align-items: end; flex-wrap: wrap; gap: 10px 12px; }
  .nh-ans { min-width: 0; }
  .nh-events { list-style: none; margin: 0; padding: 0; display: grid; }
  .nh-events li { display: grid; grid-template-columns: 110px 110px 1fr; gap: 10px; align-items: baseline; padding: 4px 0; border-bottom: 1px solid var(--grid); font: var(--type-name); letter-spacing: var(--track-name); color: var(--ink); }
  .nh-events .mono { font: var(--type-num); color: var(--ink-2); }
  .nh-kind { color: var(--ink-3); }
</style>
