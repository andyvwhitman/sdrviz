/** Whether the window is phone-sized: below this width the app uses page layouts instead of the scaled stage. */

export const PHONE_MAX_PX = 768;

class Viewport {
  phone = $state(innerWidth < PHONE_MAX_PX);
  /** the window's real size in CSS px (the stage store scales; a page layout wants the real numbers) */
  width = $state(innerWidth);
  height = $state(innerHeight);

  constructor() {
    addEventListener("resize", () => {
      this.width = innerWidth;
      this.height = innerHeight;
      this.phone = innerWidth < PHONE_MAX_PX;
    });
  }
}

export const viewport = new Viewport();
