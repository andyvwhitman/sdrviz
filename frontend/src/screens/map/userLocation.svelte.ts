import type { Fix } from "./lib/userLocation";

export type LocationStatus = "idle" | "locating" | "tracking" | "denied" | "unavailable";

/** Watches the device position at the best precision it offers. Call `start()` once and `stop()` when done. */
class UserLocation {
  fix = $state<Fix | null>(null);
  status = $state<LocationStatus>("idle");
  private watchId: number | null = null;

  start(): void {
    if (this.watchId !== null) return;
    // geolocation exists only in a secure context (https or localhost)
    if (!("geolocation" in navigator) || !window.isSecureContext) {
      this.status = "unavailable";
      return;
    }
    this.status = "locating";
    this.watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        this.fix = { lon: coords.longitude, lat: coords.latitude, accuracyM: coords.accuracy };
        this.status = "tracking";
      },
      (error) => {
        this.status = error.code === error.PERMISSION_DENIED ? "denied" : "unavailable";
        if (error.code === error.PERMISSION_DENIED) this.fix = null;
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
  }

  stop(): void {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}

export const userLocation = new UserLocation();
