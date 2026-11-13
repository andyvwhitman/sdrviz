/** Client routing on the History API (about 40 lines): path + query, lazy screens, query preserved. */

import { carryGlobals } from "./params";

class Router {
  path = $state(location.pathname);
  search = $state(location.search);

  constructor() {
    addEventListener("popstate", () => this.sync());
  }

  private sync(): void {
    this.path = location.pathname;
    this.search = location.search;
  }

  /** Go to `to` ("/history" or "/history?train=MARC%20410"). The global parameters follow along. */
  go(to: string, { replace = false, keepGlobals = true } = {}): void {
    const url = new URL(to, location.origin);
    if (keepGlobals) {
      const carried = new URLSearchParams(carryGlobals(this.search));
      carried.forEach((value, key) => url.searchParams.has(key) || url.searchParams.set(key, value));
    }
    const target = url.pathname + url.search;
    if (target === location.pathname + location.search) return;
    history[replace ? "replaceState" : "pushState"](null, "", target);
    this.sync();
  }

  /** Update query parameters in place (screens write `?tx=` / `?inspect=` back to the URL). */
  setQuery(changes: Record<string, string | null>): void {
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(changes)) {
      if (value == null) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    history.replaceState(null, "", url.pathname + url.search);
    this.sync();
  }

  /** The current value of a query parameter. Reactive. */
  query(name: string): string | null {
    return new URLSearchParams(this.search).get(name);
  }
}

export const router = new Router();

/** onclick for an <a href>: navigate without a page load, except for modified clicks. */
export function followLink(event: MouseEvent): void {
  const anchor = event.currentTarget as HTMLAnchorElement;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  router.go(anchor.getAttribute("href") ?? "/");
}
