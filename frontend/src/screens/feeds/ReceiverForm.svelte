<script lang="ts">
  /**
   * Edit the live receiver (the rtl_tcp feed): connection, tuning, gain, squelch and location. Saving applies
   * the settings at once: the backend retunes the radio and moves the feed. The status strip shows what it is doing.
   */
  import { onDestroy, onMount } from "svelte";
  import Button from "$lib/components/Button.svelte";
  import Chip from "$lib/components/Chip.svelte";
  import Field from "$lib/components/Field.svelte";
  import KeyValue from "$lib/components/KeyValue.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { api, ApiError } from "$lib/api/client";
  import type { ChipKind } from "$lib/hud/chips";
  import {
    describeStatus,
    draftFrom,
    settingsFrom,
    validateReceiver,
    type RadioStatus,
    type ReceiverDraft,
    type ReceiverErrors,
    type ReceiverSettings,
  } from "./receiverForm";

  interface Props {
    ondone: () => void;
  }
  let { ondone }: Props = $props();

  let draft = $state<ReceiverDraft | null>(null);
  let errors = $state<ReceiverErrors>({});
  let failure = $state("");
  let busy = $state(false);
  let status = $state<RadioStatus>({ state: "off" });

  const STATUS_KIND: Record<RadioStatus["state"], ChipKind> = {
    streaming: "nominal",
    starting: "active",
    reconnecting: "degraded",
    disabled: "offline",
    off: "offline",
  };

  /** the backend reconnects within a second or two of a save, so poll quickly while the form is open */
  const POLL_MS = 1000;
  let timer: ReturnType<typeof setInterval>;
  const poll = () =>
    api.radio
      .status()
      .then((s) => (status = s as unknown as RadioStatus))
      .catch(() => {}); // the readout is decoration

  onMount(async () => {
    try {
      draft = draftFrom((await api.radio.settings()) as unknown as ReceiverSettings);
    } catch {
      failure = "Backend unreachable";
    }
    poll();
    timer = setInterval(poll, POLL_MS);
  });
  onDestroy(() => clearInterval(timer));

  async function save(): Promise<void> {
    if (!draft) return;
    errors = validateReceiver(draft);
    if (Object.keys(errors).length) return;
    busy = true;
    failure = "";
    try {
      await api.radio.saveSettings({ ...settingsFrom(draft) });
      await poll();
      ondone();
    } catch (error) {
      failure = error instanceof ApiError ? error.message : "Backend unreachable";
    } finally {
      busy = false;
    }
  }

  const throughput = $derived(status.throughput == null ? "— —" : `${Math.round(status.throughput * 100)} %`);
  const tuned = $derived(status.center_hz ? `${(status.center_hz / 1e6).toFixed(4)} MHz at ${((status.rate ?? 0) / 1e6).toFixed(3)} MS/s` : "— —");
</script>

  <section class="fb-insp br fb-form fb-recv" aria-label="Edit receiver">
  <header class="fb-insp__head">
    <span class="t-panel">EDIT RECEIVER</span>
    <Chip kind={STATUS_KIND[status.state]} text={describeStatus(status)} />
    <span class="grow"></span>
    <Button sm onclick={ondone}>CANCEL</Button>
    <Button sm primary disabled={busy || !draft} onclick={save}>SAVE</Button>
  </header>
  {#if failure}<p class="fb-form__fail" role="alert">{failure}</p>{/if}

  <div class="fb-recv__status">
    <KeyValue label="CONNECTION" value={status.host ?? "— —"} />
    <KeyValue label="TUNED" value={tuned} />
    <KeyValue label="TUNER" value={status.tuner ?? "— —"} />
    <KeyValue label="THROUGHPUT" value={throughput} />
    {#if status.error}<p class="fb-form__fail">{status.error}</p>{/if}
  </div>

  {#if draft}
    <h4 class="fb-form__h">CONNECTION</h4>
    <div class="fb-form__grid">
      <Field label="NAME" bind:value={draft.name} text error={errors.name} hint="Shown on Feeds and the map" />
      <Field label="HOST" bind:value={draft.host} text error={errors.host} hint="rtl_tcp server, e.g. sdr.local" />
      <Field label="PORT" bind:value={draft.port} error={errors.port} />
    </div>

    <h4 class="fb-form__h">TUNING</h4>
    <div class="fb-form__grid">
      <Field label="CENTRE FREQUENCY" bind:value={draft.freq_mhz} unit="MHz" error={errors.freq_mhz} hint="24 to 1766 MHz" />
      <Field
        label="SAMPLE RATE"
        bind:value={draft.rate_msps}
        unit="MS/s"
        error={errors.rate_msps}
        hint="A multiple of 0.048: each channel is filtered and decimated to 48 kS/s"
      />
      <Field label="GAIN" bind:value={draft.gain_db} unit="dB" error={errors.gain_db} disabled={draft.auto_gain} hint="0 to 50 dB" />
      <div class="fb-form__flags">
        <Toggle label="AUTO GAIN" bind:checked={draft.auto_gain} />
      </div>
      <Field label="SQUELCH" bind:value={draft.squelch_db} unit="dB" error={errors.squelch_db} hint="Opens this far above a channel's noise" />
    </div>

    <h4 class="fb-form__h">LOCATION</h4>
    <div class="fb-form__grid">
      <Field label="LATITUDE" bind:value={draft.lat} unit="°" error={errors.lat} />
      <Field label="LONGITUDE" bind:value={draft.lon} unit="°" error={errors.lon} />
      <div class="fb-form__flags">
        <Toggle label="ENABLED" bind:checked={draft.enabled} />
      </div>
    </div>
  {/if}
</section>
