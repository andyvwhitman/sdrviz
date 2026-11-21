/**
 * Route table: the screens, plus /login (no shell). Each route lazily imports
 * `screens/<dir>/Screen.svelte`; until a package delivers it the route shows a stub.
 */

import type { Component } from "svelte";
import StubScreen from "$lib/components/StubScreen.svelte";

export type ScreenId = "live-ops" | "frequencies" | "feeds" | "map" | "settings" | "spot" | "frequency" | "docs" | "login" | "kit";

export interface Route {
  id: ScreenId;
  path: string;
  /** nav label and title-block SCREEN value */
  name: string;
  /** directory under src/screens */
  dir: string;
  /** false for login: no header, nav or status line (spec 4.6) */
  shell: boolean;
  /**
   * "stage" (default): the fixed-height stage scaled to the window, for the wall displays.
   * "page": an ordinary responsive document that scrolls, for phones (the shell becomes PageShell).
   * "fluid": the desktop shell at 1:1 CSS pixels, content filling the window (Live Ops, decision 62).
   */
  layout?: "stage" | "page" | "fluid";
  /**
   * What a phone (under 768 px) gets for a stage route: "page" renders the screen as a responsive document,
   * "plate" shows a "needs a wider screen" notice instead. A route with layout "page" is already phone-ready.
   */
  phone?: "page" | "plate";
  /** also answers every path below this one ("/frequency/amtk-k-tower"); the screen reads the rest */
  prefix?: boolean;
  /** hidden from viewers and closed to them (they are sent to the default screen) */
  adminOnly?: boolean;
}

/**
 * Whether a window is "phone" for this route. Live Ops has its own test (under 768 wide or under 560 tall, so a
 * landscape phone counts); every other route uses the width alone.
 */
export const isPhoneFor = (route: Route, viewport: { phone: boolean; handset: boolean }): boolean => (route.layout === "fluid" ? viewport.handset : viewport.phone);

/** How a route is laid out in a window of this kind: its own layout, or the phone version of a stage route. */
export function layoutFor(route: Route, phone: boolean): "stage" | "page" | "fluid" | "plate" {
  if (route.layout === "page") return "page";
  if (!phone) return route.layout === "fluid" ? "fluid" : "stage";
  return route.phone ?? "stage";
}

export const ROUTES: Route[] = [
  { id: "live-ops", path: "/live", name: "LIVE OPS", dir: "live-ops", shell: true, layout: "fluid", phone: "page" },
  { id: "frequencies", path: "/frequencies", name: "FREQUENCIES", dir: "frequencies", shell: true, layout: "fluid", phone: "page" },
  { id: "feeds", path: "/feeds", name: "FEEDS", dir: "feeds", shell: true, phone: "plate" },
  { id: "map", path: "/map", name: "MAP", dir: "map", shell: true, phone: "page" },
  { id: "settings", path: "/settings", name: "SETTINGS", dir: "settings", shell: true, phone: "plate", adminOnly: true },
  { id: "spot", path: "/spot", name: "SPOT", dir: "spot", shell: true, layout: "page" },
  { id: "frequency", path: "/frequency", name: "FREQUENCY", dir: "frequency", shell: true, layout: "page", prefix: true },
  // reference, not an instrument: reached from a Settings card and absent from NAV (decision 79, D15)
  { id: "docs", path: "/docs", name: "DOCS", dir: "docs", shell: true, layout: "page", prefix: true },
  { id: "login", path: "/login", name: "LOGIN", dir: "system", shell: false, phone: "page" },
  ...(import.meta.env.DEV ? [{ id: "kit", path: "/kit", name: "KIT", dir: "kit", shell: true } as const] : []),
];

/** The header tabs, in order. History and Stats still answer at their paths but are off the nav for now. */
const NAV_ORDER: ScreenId[] = ["map", "live-ops", "frequencies", "feeds", "settings", "spot"];
export const NAV = NAV_ORDER.map((id) => ROUTES.find((r) => r.id === id)!);

/** The tabs this session may use. */
export const navFor = (isAdmin: boolean): Route[] => NAV.filter((r) => isAdmin || !r.adminOnly);

/** The keyboard's top letter row: Q opens the first tab, W the second, and so on. */
export const NAV_KEYS = "qwertyuiop";

export const DEFAULT_PATH = "/live";

/** Where a session lands: SPOT on a phone (a plate is never a destination), Live Ops otherwise. */
export const homePath = (phone: boolean): string => (phone ? "/spot" : DEFAULT_PATH);

export const routeFor = (path: string): Route | undefined => ROUTES.find((r) => r.path === path || (r.prefix && path.startsWith(`${r.path}/`)));

type ScreenModule = { default: Component };
const screenModules = import.meta.glob<ScreenModule>("./screens/*/Screen.svelte");

/** Load a route's screen; a broken or missing screen cannot break any other route. */
export async function loadScreen(route: Route): Promise<Component> {
  const loader = screenModules[`./screens/${route.dir}/Screen.svelte`];
  return loader ? (await loader()).default : StubScreen;
}
