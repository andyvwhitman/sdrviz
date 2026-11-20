<script lang="ts">
  /** Add a node: name, where it is, and the channel preset. Location is typed, or copied from one of the feeds. */
  import { onMount } from "svelte";
  import Button from "$lib/components/Button.svelte";
  import Field from "$lib/components/Field.svelte";
  import { api } from "$lib/api/client";
  import { emptyNodeDraft, toNewNode, validateNodeDraft, type NodeDraft, type NodeDraftErrors } from "$lib/nodeKey";
  import type { NewNode } from "$lib/types/nodes";
  import SelectField from "../feeds/SelectField.svelte";

  interface Props {
    /** sends the node to the API; throws with a message the form shows */
    onsave: (node: NewNode) => Promise<void>;
    oncancel: () => void;
  }
  let { onsave, oncancel }: Props = $props();

  /** the preset list is the API's: the enabled frequencies of the node (follows Frequencies edits), or the whole AAR band */
  const PRESETS = [
    { value: "assigned", text: "ENABLED FREQUENCIES" },
    { value: "aar", text: "AAR 07-97" },
  ];
  const MANUAL = "";

  let draft = $state<NodeDraft>(emptyNodeDraft());
  let errors = $state<NodeDraftErrors>({});
  let failure = $state("");
  let busy = $state(false);
  let feeds = $state<{ id: string; name: string; lat: number; lon: number }[]>([]);
  let feedId = $state(MANUAL);

  onMount(() => {
    api.feeds.list().then(
      (rows) => (feeds = (rows as unknown as typeof feeds).filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon))),
      () => {}, // typing the location by hand still works
    );
  });

  function pickFeed(id: string): void {
    feedId = id;
    const feed = feeds.find((f) => f.id === id);
    if (feed) [draft.lat, draft.lon] = [String(feed.lat), String(feed.lon)];
  }

  async function save(): Promise<void> {
    errors = validateNodeDraft(draft);
    if (Object.keys(errors).length) return;
    busy = true;
    failure = "";
    try {
      await onsave(toNewNode(draft));
    } catch (error) {
      failure = error instanceof Error ? error.message : "Backend unreachable";
      busy = false;
    }
  }
</script>

<section class="st-card st-form br" aria-label="New node">
  <header class="st-card__head">
    <span class="t-panel">NEW NODE</span>
    <span class="grow"></span>
    <Button sm onclick={oncancel}>CANCEL</Button>
    <Button sm primary disabled={busy} onclick={save}>{busy ? "CREATING…" : "CREATE NODE"}</Button>
  </header>
  {#if failure}<p class="st-card__error" role="alert">{failure}</p>{/if}

  <div class="st-form__grid">
    <div class="st-form__wide"><Field label="NAME" bind:value={draft.name} text autofocus error={errors.name} hint="Where it sits, e.g. Union Station roof" /></div>
    <Field label="LATITUDE" bind:value={draft.lat} error={errors.lat} hint="38.897" />
    <Field label="LONGITUDE" bind:value={draft.lon} error={errors.lon} hint="-77.006" />
    <SelectField
      label="OR COPY FROM FEED"
      options={[{ value: MANUAL, text: "TYPE IT" }, ...feeds.map((f) => ({ value: f.id, text: f.name.toUpperCase() }))]}
      bind:value={() => feedId, pickFeed}
    />
    <SelectField label="CHANNEL PRESET" options={PRESETS} bind:value={draft.preset} />
  </div>
</section>
