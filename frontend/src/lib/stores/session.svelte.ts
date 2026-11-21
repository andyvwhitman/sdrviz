import { api, ApiError } from "$lib/api/client";
import { loginFailure, type LoginFailure } from "$lib/loginFailure";

/** How long to wait before asking again when the backend could not be reached. */
const RETRY_MS = 3000;

class SessionStore {
  /** null until GET /auth/session has answered */
  authenticated = $state<boolean | null>(null);
  sim = $state(true);
  /** the server version, for the footer title block */
  build = $state("—");
  role = $state<"admin" | "viewer">("admin");
  /** viewers read and listen; the controls that change things are for admins (the backend enforces it) */
  isAdmin = $derived(this.role === "admin");
  /** the backend did not answer (network failure, 5xx): not the same as being logged out */
  unreachable = $state(false);

  /** Only a 401 means "logged out"; anything else keeps asking until the backend answers. */
  async check(): Promise<void> {
    try {
      const info = await api.auth.session();
      this.authenticated = info.authenticated;
      this.sim = info.sim;
      this.build = info.version;
      this.role = info.role ?? "admin";
      this.unreachable = false;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        this.authenticated = false;
        this.unreachable = false;
        return;
      }
      this.unreachable = true;
      setTimeout(() => void this.check(), RETRY_MS);
    }
  }

  /** Returns what to tell the user, or null when logged in. */
  async login(password: string): Promise<LoginFailure | null> {
    try {
      await api.auth.login(password);
      await this.check(); // learns the role
      this.authenticated = true;
      return null;
    } catch (error) {
      return loginFailure(error);
    }
  }

  async logout(): Promise<void> {
    await api.auth.logout().catch(() => {});
    this.authenticated = false;
    this.role = "admin";
  }

  /** A 401 anywhere lands here. */
  expire(): void {
    this.authenticated = false;
  }
}

export const session = new SessionStore();
