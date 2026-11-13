/**
 * Bootstrap sequence (docs/build-plan.md A2): read URL params, POST /sim/jump if `scenario`,
 * load the session, open the socket. `<html data-ready="1">` is set after the first snapshot
 * (see ws/connection.ts) or, on /login, once the session is known; the screenshot script waits on it.
 */

import { api, setUnauthorizedHandler } from "./api/client";
import { applyParamsToDocument, params } from "./params";
import { prefs } from "./stores/prefs.svelte";
import { session } from "./stores/session.svelte";
import { connect, disconnect } from "./ws/connection";

let jumped = false;

/** Apply ?scenario= once, before the first socket opens. `freeze=1` stops the clock for deterministic frames. */
async function jumpToScenario(): Promise<void> {
  if (jumped || !params.scenario) return;
  jumped = true;
  await api.sim.jump({ scenario: params.scenario, speed: params.freeze ? 0 : params.speed }).catch((error) => {
    console.warn("sim jump failed", error);
  });
}

/** Everything that needs a logged-in session. */
export async function startLive(): Promise<void> {
  await jumpToScenario();
  prefs.load().catch((error) => console.warn("prefs unavailable", error));
  connect();
}

export function stopLive(): void {
  disconnect();
}

/** Called once from main.ts. */
export async function boot(): Promise<void> {
  applyParamsToDocument();
  setUnauthorizedHandler(() => session.expire());
  await session.check();
}
