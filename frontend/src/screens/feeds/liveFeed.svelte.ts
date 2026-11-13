/**
 * The age of a silent feed, which the snapshot alone leaves frozen
 * (`feed` messages only arrive when the feed changes state, so the age is counted on the sim clock).
 */

import { untrack } from "svelte";

/**
 * Age in seconds of a silent feed, counted on the sim clock from the moment the backend reported
 * `reported` (a new report restarts the count). Null stays null; `running` false freezes it at the report.
 */
export function silentAge(reported: () => number | null | undefined, now: () => number, running: () => boolean) {
  let anchor = $state(0);
  $effect.pre(() => {
    reported();
    anchor = untrack(now);
  });
  return {
    get value(): number | null {
      const age = reported();
      if (age == null) return null;
      return running() ? age + Math.max(0, now() - anchor) : age;
    },
  };
}
