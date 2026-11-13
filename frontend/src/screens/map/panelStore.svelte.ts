import { router } from "$lib/router.svelte";
import { type PanelKind, type PanelState, panelQuery, parsePanel } from "./lib/panel";

const TRAIL_MAX = 10;

/**
 * The one side panel (decision 23): what it shows lives in the map's query, so a reload restores it. Opening
 * something swaps the content in place (a maximized panel stays maximized), and BACK steps through what it showed.
 */
class PanelStore {
  current = $derived(parsePanel((name) => router.query(name)));
  /** what the panel showed before, most recent last */
  #trail = $state<PanelState[]>([]);
  canGoBack = $derived(this.#trail.length > 0);

  open(kind: PanelKind, id: string, date: string | null = null): void {
    const was = this.current;
    if (was && (was.kind !== kind || was.id !== id)) this.#trail = [...this.#trail, was].slice(-TRAIL_MAX);
    router.setQuery(panelQuery({ kind, id, date, full: was?.full ?? false }));
  }

  back(): void {
    const [prev, ...rest] = [...this.#trail].reverse();
    if (!prev || !this.current) return;
    this.#trail = rest.reverse();
    router.setQuery(panelQuery({ ...prev, full: this.current.full }));
  }

  close(): void {
    this.#trail = [];
    router.setQuery(panelQuery(null));
  }

  setFull(full: boolean): void {
    if (this.current) router.setQuery(panelQuery({ ...this.current, full }));
  }

  setDate(date: string): void {
    if (this.current) router.setQuery(panelQuery({ ...this.current, date }));
  }
}

export const panel = new PanelStore();
