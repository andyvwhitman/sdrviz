/**
 * The wall's one plate for gesture messages ("CH52 NOT ENABLED", "5454 ADDED · ENABLED ON SDR-01"), kept for a few
 * seconds. It lives outside the front wall component because the pointer may have left (or never been there, on a
 * touch screen) by the time a request finishes.
 */
import type { Message, Tone } from "./gesture";

class ListenFlash {
  text = $state<string | null>(null);
  tone = $state<Tone>("ink");
  #timer: ReturnType<typeof setTimeout> | undefined;

  say({ text, tone, ms }: Message): void {
    this.text = text;
    this.tone = tone;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => (this.text = null), ms);
  }

  clear(): void {
    clearTimeout(this.#timer);
    this.text = null;
  }
}

export const listenFlash = new ListenFlash();
