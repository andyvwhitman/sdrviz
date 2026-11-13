import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

// The backend (FastAPI, see docs/build-plan.md) listens on :8100; SDRVIZ_BACKEND overrides it for dev.
const BACKEND = process.env.SDRVIZ_BACKEND ?? "http://127.0.0.1:8100";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: { $lib: fileURLToPath(new URL("./src/lib", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": BACKEND,
      "/ws": { target: BACKEND, ws: true },
    },
  },
  // Package preview servers (5174-5178) use the same proxy.
  preview: {
    proxy: {
      "/api": BACKEND,
      "/ws": { target: BACKEND, ws: true },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
