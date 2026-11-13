import { api, ApiError } from "$lib/api/client";

class SessionStore {
  /** null until GET /auth/session has answered */
  authenticated = $state<boolean | null>(null);
  sim = $state(true);

  async check(): Promise<void> {
    try {
      const info = await api.auth.session();
      this.authenticated = info.authenticated;
      this.sim = info.sim;
    } catch {
      this.authenticated = false;
    }
  }

  /** Returns an error message, or null when logged in. */
  async login(password: string): Promise<string | null> {
    try {
      await api.auth.login(password);
      this.authenticated = true;
      return null;
    } catch (error) {
      return error instanceof ApiError ? error.message : "Backend unreachable";
    }
  }

  async logout(): Promise<void> {
    await api.auth.logout().catch(() => {});
    this.authenticated = false;
  }

  /** A 401 anywhere lands here. */
  expire(): void {
    this.authenticated = false;
  }
}

export const session = new SessionStore();
