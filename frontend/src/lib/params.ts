/**
 * App URL parameters, read once at boot (docs/build-plan.md 2). They mirror hud.js 8.2.
 * Per-screen parameters (select, inspect, tx, train, mode, range, route) belong to the screens.
 */

export type MotionMode = "full" | "reduced";
export type StageSize = 1920 | 1440;

export interface AppParams {
  /** jump the sim to a scripted moment before the socket opens */
  scenario: string | null;
  /** with `scenario`: stop the sim clock so frames are deterministic */
  freeze: boolean;
  speed: number;
  size: StageSize;
  /** false skips the build-on motion */
  build: boolean;
  motion: MotionMode;
  gray: boolean;
  /** dev override for the system states, owned by the system screen */
  force: string | null;
}

/** Query keys that follow the user from screen to screen. */
export const GLOBAL_KEYS = ["scenario", "freeze", "speed", "size", "build", "motion", "gray", "force"] as const;

/** Narrow windows get the 1440 stage (spec 4.1). */
export const NARROW_WIDTH_PX = 1700;

export function parseParams(search: string, viewportWidth: number, prefersReduced: boolean): AppParams {
  const q = new URLSearchParams(search);
  const size = q.get("size");
  const motion = q.get("motion");
  const speed = Number(q.get("speed"));
  return {
    scenario: q.get("scenario"),
    freeze: q.get("freeze") === "1",
    speed: Number.isFinite(speed) && speed > 0 ? speed : 1,
    size: size === "1440" ? 1440 : size === "1920" ? 1920 : viewportWidth < NARROW_WIDTH_PX ? 1440 : 1920,
    build: q.get("build") !== "0",
    motion: motion === "full" || motion === "reduced" ? motion : prefersReduced ? "reduced" : "full",
    gray: q.get("gray") === "1",
    force: q.get("force"),
  };
}

/** The global parameters of `search`, as a query string without the leading "?" (for nav links). */
export function carryGlobals(search: string): string {
  const from = new URLSearchParams(search);
  const to = new URLSearchParams();
  for (const key of GLOBAL_KEYS) {
    const value = from.get(key);
    if (value != null) to.set(key, value);
  }
  return to.toString();
}

/** Parsed once from the page URL at module load. */
export const params: AppParams = parseParams(location.search, window.innerWidth, window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

/** Mirror the parameters to <html data-*> for the stylesheets (hud.css reads data-size and data-motion). */
export function applyParamsToDocument(p: AppParams = params): void {
  const root = document.documentElement;
  root.dataset.size = String(p.size);
  root.dataset.motion = p.motion;
  if (p.scenario) root.dataset.state = p.scenario;
  if (p.gray) root.dataset.gray = "";
}
