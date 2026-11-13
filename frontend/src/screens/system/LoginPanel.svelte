<script lang="ts">
  /** Login (no shell, spec 4.6): one 400 px panel centred at 46 % height and a static frequency ruler. */
  import Button from "$lib/components/Button.svelte";
  import { params } from "$lib/params";
  import { session } from "$lib/stores/session.svelte";
  import FrequencyRuler from "./FrequencyRuler.svelte";
  import "./system.css";

  /** `?force=error` shows the rejected state without a round trip (design review). */
  const forcedError = params.force === "error";
  let password = $state(forcedError ? "railroad" : "");
  let error = $state(forcedError ? "Password not accepted." : "");
  let busy = $state(false);

  const RULER_W = params.size - 64;

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    busy = true;
    const failure = await session.login(password);
    busy = false;
    // Success needs nothing here: the app guard sends an authenticated session on to Live Ops.
    if (failure) error = failure === "Backend unreachable" ? failure : "Password not accepted.";
  }
</script>

<div class="sy-login">
  <section class="sy-login__panel br" aria-label="Sign in">
    <div class="t-mark">SDRVIZ</div>
    <div class="sy-login__sub">WAYSIDE LISTENING TABLE · NEC DC–BAL</div>
    <form class="sy-login__form" onsubmit={submit}>
      <label class="field" class:is-error={!!error}>
        <span class="field__label">WLT-1 · AUTHORIZATION</span>
        <span class="sy-login__input">
          <!-- svelte-ignore a11y_autofocus -->
          <input class="field__input" type="password" autocomplete="current-password" autofocus data-focus={error ? undefined : "auto"} bind:value={password} oninput={() => (error = "")} />
          {#if !password}<span class="field__caret" aria-hidden="true"></span>{/if}
        </span>
        <span class="field__error" role={error ? "alert" : undefined}>{error}</span>
      </label>
      <Button primary type="submit" disabled={busy}>ENTER</Button>
    </form>
  </section>
  <svg class="hud sy-login__ruler" width={RULER_W} height="40" viewBox="0 0 {RULER_W} 40">
    <FrequencyRuler w={RULER_W} h={32} />
  </svg>
</div>
