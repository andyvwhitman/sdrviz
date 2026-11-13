<script lang="ts">
  /** Create, rename, reorder and delete a bank; add and remove its channels (spec 5.22 typed delete). */
  import { ApiError } from "$lib/api/client";
  import Button from "$lib/components/Button.svelte";
  import Field from "$lib/components/Field.svelte";
  import SimTag from "$lib/components/SimTag.svelte";
  import { feedName } from "$lib/hud/roles";
  import type { Feed } from "$lib/types/live";
  import { catalogue } from "./catalogue.svelte";
  import { slugify } from "./look";
  import SelectField from "./SelectField.svelte";
  import type { BankRecord } from "./types";

  interface Props {
    /** the bank being edited; null creates a new one */
    bank: BankRecord | null;
    feeds: Feed[];
    activeId: string;
    /** the largest bank, for the capacity line */
    largest: number;
    /** the bank to keep editing after a save, null after close or delete */
    ondone: (bankId: string | null) => void;
    onactivate: (id: string) => void;
  }
  let { bank, feeds, activeId, largest, ondone, onactivate }: Props = $props();

  let name = $state("");
  let homeFeed = $state("");
  let ids = $state<string[]>([]);
  let selected = $state<string | null>(null);
  let adding = $state("");
  let confirm = $state("");
  let failure = $state("");
  let nameError = $state("");

  // A change to the bank itself (a membership checkbox, a reload) resets the draft.
  $effect(() => {
    name = bank?.name ?? "";
    homeFeed = bank?.home_feed ?? feeds[0]?.id ?? "";
    ids = [...(bank?.frequency_ids ?? [])];
    selected = null;
    confirm = "";
    failure = "";
    nameError = "";
  });

  const channelLabel = (id: string): string => `CH${String(catalogue.frequency(id)?.aar_channel ?? "??").padStart(2, "0")}`;
  const addable = $derived(catalogue.frequencies.filter((f) => !ids.includes(f.id)).sort((a, b) => a.aar_channel - b.aar_channel));
  const feedOptions = $derived(feeds.map((f) => ({ value: f.id, text: feedName(f.id) })));
  const dirty = $derived(!bank || name !== bank.name || homeFeed !== bank.home_feed || ids.join() !== bank.frequency_ids.join());

  function move(delta: -1 | 1): void {
    const from = selected ? ids.indexOf(selected) : -1;
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(to, 0, ...next.splice(from, 1));
    ids = next;
  }

  function add(): void {
    if (!adding) return;
    ids = [...ids, adding];
    selected = adding;
    adding = "";
  }

  function remove(): void {
    if (!selected) return;
    ids = ids.filter((id) => id !== selected);
    selected = null;
  }

  async function attempt(action: () => Promise<void>): Promise<void> {
    failure = "";
    try {
      await action();
    } catch (error) {
      failure = error instanceof ApiError ? error.message : "Backend unreachable";
    }
  }

  async function save(): Promise<void> {
    nameError = name.trim() ? "" : "Required";
    if (nameError) return;
    const id = bank?.id ?? slugify(name, "bank");
    if (!bank && catalogue.banks.some((b) => b.id === id)) {
      nameError = "A bank with this name exists";
      return;
    }
    await attempt(async () => {
      await catalogue.saveBank({ ...(bank ?? { id, description: "", short: "", sim: false }), name: name.trim(), home_feed: homeFeed, frequency_ids: ids }, !bank);
      ondone(id);
    });
  }

  async function destroy(): Promise<void> {
    if (!bank) return;
    await attempt(async () => {
      await catalogue.deleteBank(bank.id);
      ondone(null);
    });
  }
</script>

<div class="fb-edit">
  <div class="fb-ph">
    <span class="t-panel">{bank ? `BANK · ${bank.name.toUpperCase()}` : "NEW BANK"}</span>
    {#if bank?.sim}<SimTag />{/if}
    <span class="t-micro">{ids.length} CH</span>
    {#if bank && bank.id !== activeId}<Button sm onclick={() => onactivate(bank.id)}>ACTIVATE</Button>{/if}
    <Button sm onclick={() => ondone(null)}>{bank ? "CLOSE" : "CANCEL"}</Button>
  </div>
  <div class="fb-edit__row">
    <Field label="BANK NAME" bind:value={name} text width={168} error={nameError} />
    <SelectField label="HOME FEED" bind:value={homeFeed} options={feedOptions} width={88} />
    <Button primary disabled={!dirty} onclick={save}>SAVE</Button>
    {#if bank}
      <span class="fb-vr"></span>
      <Field label="TYPE THE BANK NAME TO DELETE" bind:value={confirm} text placeholder={bank.name} width={176} hint="Channels stay monitored and recorded." />
      <Button disabled={confirm !== bank.name} onclick={destroy}>DELETE BANK</Button>
    {/if}
  </div>
  {#if failure}<p class="fb-form__fail" role="alert">{failure}</p>{/if}

  <div class="fb-order" aria-label="Tile order">
    <span class="k">TILE ORDER</span>
    {#each ids as id (id)}
      <button class="fb-order__chip" aria-pressed={selected === id} onclick={() => (selected = selected === id ? null : id)}>{channelLabel(id)}</button>
    {/each}
    {#if selected}
      <Button sm onclick={() => move(-1)}>‹</Button><Button sm onclick={() => move(1)}>›</Button><Button sm onclick={remove}>REMOVE</Button>
    {/if}
    <span class="fb-order__add">
      <SelectField label="ADD CHANNEL" bind:value={adding} options={[{ value: "", text: "—" }, ...addable.map((f) => ({ value: f.id, text: `CH${String(f.aar_channel).padStart(2, "0")} ${f.label}` }))]} width={140} />
      <Button sm disabled={!adding} onclick={add}>ADD</Button>
    </span>
  </div>
  <div class="fb-cap">LIVE OPS CAPACITY<span class="sep"></span>STANDARD <span class="mono">20</span> AT <span class="mono">1920 × 1080</span><span class="sep"></span>COMPACT <span class="mono">15</span> AT <span class="mono">1440 × 900</span><span class="sep"></span>LARGEST BANK <span class="mono">{largest}</span></div>
</div>
