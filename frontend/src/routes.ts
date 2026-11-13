/**
 * Route table: the screens, plus /login (no shell). Each route lazily imports
 * `screens/<dir>/Screen.svelte`; until a package delivers it the route shows a stub.
 */

import type { Component } from "svelte";
import StubScreen from "$lib/components/StubScreen.svelte";

export type ScreenId = "live-ops" | "feeds" | "map" | "settings" | "login" | "kit";

export interface Route {
  id: ScreenId;
  path: string;
  /** nav label and title-block SCREEN value */
  name: string;
  /** directory under src/screens */
  dir: string;
  /** false for login: no header, nav or status line (spec 4.6) */
  shell: boolean;
}

export const ROUTES: Route[] = [
  { id: "live-ops", path: "/live", name: "LIVE OPS", dir: "live-ops", shell: true },
  { id: "feeds", path: "/feeds", name: "FEEDS & BANKS", dir: "feeds", shell: true },
  { id: "map", path: "/map", name: "MAP", dir: "map", shell: true },
  { id: "settings", path: "/settings", name: "SETTINGS", dir: "settings", shell: true },
  { id: "login", path: "/login", name: "LOGIN", dir: "system", shell: false },
  ...(import.meta.env.DEV ? [{ id: "kit", path: "/kit", name: "KIT", dir: "kit", shell: true } as const] : []),
];

/** The header tabs, in order. History and Stats still answer at their paths but are off the nav for now. */
const NAV_ORDER: ScreenId[] = ["map", "live-ops", "feeds", "settings"];
export const NAV = NAV_ORDER.map((id) => ROUTES.find((r) => r.id === id)!);

/** The keyboard's top letter row: Q opens the first tab, W the second, and so on. */
export const NAV_KEYS = "qwertyuiop";

export const DEFAULT_PATH = "/live";

export const routeFor = (path: string): Route | undefined => ROUTES.find((r) => r.path === path);

type ScreenModule = { default: Component };
const screenModules = import.meta.glob<ScreenModule>("./screens/*/Screen.svelte");

/** Load a route's screen; a broken or missing screen cannot break any other route. */
export async function loadScreen(route: Route): Promise<Component> {
  const loader = screenModules[`./screens/${route.dir}/Screen.svelte`];
  return loader ? (await loader()).default : StubScreen;
}
