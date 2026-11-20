/** Whether the window is phone-sized: below this width the app uses page layouts instead of the scaled stage. */

export const PHONE_MAX_PX = 768;
/** Live Ops' own test (direction 2.6): under this height a landscape phone gets the handset layout too. */
export const HANDSET_MIN_HEIGHT_PX = 560;

class Viewport {
  phone = $state(innerWidth < PHONE_MAX_PX);
  /** Live Ops gives a window the handset layout when it is under 768 px wide or under 560 px tall */
  handset = $state(innerWidth < PHONE_MAX_PX || innerHeight < HANDSET_MIN_HEIGHT_PX);
  /** the window's real size in CSS px (the stage store scales; a page layout wants the real numbers) */
  width = $state(innerWidth);
  height = $state(innerHeight);

  constructor() {
    addEventListener("resize", () => {
      this.width = innerWidth;
      this.height = innerHeight;
      this.phone = innerWidth < PHONE_MAX_PX;
      this.handset = innerWidth < PHONE_MAX_PX || innerHeight < HANDSET_MIN_HEIGHT_PX;
    });
  }
}

export const viewport = new Viewport();
