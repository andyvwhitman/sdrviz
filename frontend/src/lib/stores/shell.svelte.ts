/**
 * What a screen tells the shell: the title-block scope ("BANK  NEC CORRIDOR") and the status
 * line's nominal readout. The shell resets both on every route change.
 */

class ShellStore {
  /** [key, value] shown in the title block, or null */
  scope = $state<[string, string] | null>(null);
  /** status line text when no event is open (Stats and History show the RECORDING readout) */
  statusFallback = $state<string | undefined>(undefined);

  /** print only the newest status entry (Feeds) */
  newestStatusOnly = $state(false);

  reset(): void {
    this.newestStatusOnly = false;
    this.scope = null;
    this.statusFallback = undefined;
  }
}

export const shell = new ShellStore();
