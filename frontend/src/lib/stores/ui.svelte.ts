/** Per-viewer display settings changed from the header. */
class UiStore {
  /** always full: the HUD never drops its motion */
  readonly motion = "full" as "full" | "reduced";
  /** show the clock in UTC instead of the sim zone (a click on any clock toggles every clock) */
  utc = $state(false);
  /** the page fills the screen (no browser chrome); Esc also leaves, so follow the browser's own state */
  fullscreen = $state(!!document.fullscreenElement);

  constructor() {
    document.addEventListener("fullscreenchange", () => (this.fullscreen = !!document.fullscreenElement));
  }

  /** Must run from a click or key press: browsers refuse fullscreen otherwise. */
  toggleFullscreen(): void {
    const change = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    change.catch((error) => console.warn("fullscreen refused", error));
  }

  toggleUtc(): void {
    this.utc = !this.utc;
  }
}

export const ui = new UiStore();
