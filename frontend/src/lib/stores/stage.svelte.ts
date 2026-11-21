/**
 * The stage's size on screen. A stage is a fixed design size scaled to fit, and screens lay out against
 * `stage.width` (the map widens its canvas to it).
 *
 * Two fits. `window` (login): the whole 1080 (or 900) px tall design scaled to the window's height, its width
 * following the window. `box` (Map, Settings): only the content box is scaled, to the measured box between the bar
 * and the footer, so the bar and footer stay at 1:1 CSS pixels (Sprint 6, B.2). There `width` names the content width.
 */

import { params } from "$lib/params";

/** The stage never gets narrower than this share of its design width; a narrower window scales it down instead. */
const MIN_WIDTH_RATIO = 0.9;
/** the bar, footer and margins around the content box in the full design: 1080 - 984 tall, 1920 - 1856 wide */
const CHROME_H = 96;
const CHROME_W = 64;

interface Box {
  width: number;
  height: number;
}

class Stage {
  /** the window fit's design height */
  readonly height = params.size === 1440 ? 900 : 1080;
  readonly designWidth: number = params.size;
  /** the content box's design size */
  readonly contentHeight = this.height - CHROME_H;
  readonly contentWidth = this.designWidth - CHROME_W;
  windowWidth = $state(innerWidth);
  windowHeight = $state(innerHeight);
  /** the measured content box, set by `<Stage fit="box">` while one is mounted */
  box = $state<Box | null>(null);
  scale = $derived(
    this.box
      ? Math.min(this.box.height / this.contentHeight, this.box.width / (this.contentWidth * MIN_WIDTH_RATIO))
      : Math.min(this.windowHeight / this.height, this.windowWidth / (this.designWidth * MIN_WIDTH_RATIO)),
  );
  width = $derived(Math.round((this.box ? this.box.width : this.windowWidth) / this.scale));

  constructor() {
    addEventListener("resize", () => {
      this.windowWidth = innerWidth;
      this.windowHeight = innerHeight;
    });
  }
}

export const stage = new Stage();
