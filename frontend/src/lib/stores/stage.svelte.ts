/**
 * The stage's size on screen. Its height is fixed (1080 or 900 design px) and it is scaled to fill the window's
 * height; its width then follows the window, so the page always fills the screen edge to edge. Screens lay out
 * against `stage.width` (Live Ops widens the spectrum and waterfall, the map widens its canvas).
 */

import { params } from "$lib/params";

/** The stage never gets narrower than this share of its design width; a narrower window scales it down instead. */
const MIN_WIDTH_RATIO = 0.9;

class Stage {
  readonly height = params.size === 1440 ? 900 : 1080;
  readonly designWidth: number = params.size;
  windowWidth = $state(innerWidth);
  windowHeight = $state(innerHeight);
  scale = $derived(Math.min(this.windowHeight / this.height, this.windowWidth / (this.designWidth * MIN_WIDTH_RATIO)));
  width = $derived(Math.round(this.windowWidth / this.scale));

  constructor() {
    addEventListener("resize", () => {
      this.windowWidth = innerWidth;
      this.windowHeight = innerHeight;
    });
  }
}

export const stage = new Stage();
