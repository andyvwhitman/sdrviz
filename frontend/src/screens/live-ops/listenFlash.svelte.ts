/**
 * What the last click on the waterfall did ("LISTENING CH54 · LIVE BANK"), kept for a few seconds. It lives outside
 * the front wall component because a click switches banks and the wall is rebuilt, and because the pointer may have
 * left (or never been there, on a touch screen) by the time the request finishes.
 */

const SHOWN_MS = 4000;

class ListenFlash {
  text = $state<string | null>(null);
  #timer: ReturnType<typeof setTimeout> | undefined;

  say(text: string): void {
    this.text = text;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => (this.text = null), SHOWN_MS);
  }
}

export const listenFlash = new ListenFlash();
