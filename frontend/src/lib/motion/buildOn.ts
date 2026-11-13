/** Screen build-on (spec 6.5): `is-building` on <html> for t-build, skipped under reduced motion or ?build=0. */

import { params } from "$lib/params";
import { ui } from "$lib/stores/ui.svelte";

const BUILD_MS = 700;
let timer: ReturnType<typeof setTimeout> | undefined;

export function buildOn(root: HTMLElement = document.documentElement): void {
  if (ui.motion === "reduced" || !params.build) return;
  root.classList.add("is-building");
  clearTimeout(timer);
  timer = setTimeout(() => root.classList.remove("is-building"), BUILD_MS);
}
