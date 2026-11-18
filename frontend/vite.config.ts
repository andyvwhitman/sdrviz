import { fileURLToPath } from "node:url";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";
import { fakeNodes } from "./dev/fakeNodes.ts";
import { fakeRecordings } from "./dev/fakeRecordings.ts";

// The backend (FastAPI, see docs/build-plan.md) listens on :8100; SDRVIZ_BACKEND overrides it for dev.
const BACKEND = process.env.SDRVIZ_BACKEND ?? "http://127.0.0.1:8100";

// SDRVIZ_HTTPS=1 serves a self-signed certificate: phones and tablets only allow geolocation in a secure context.
const HTTPS = process.env.SDRVIZ_HTTPS === "1";

// VITE_FAKE_NODES=1 answers /api/nodes* from dev/fakeNodes.ts (the node API is not built yet).
const FAKE_NODES = process.env.VITE_FAKE_NODES === "1";

// VITE_FAKE_RECORDINGS=1 answers /api/recordings* and the frequency activity calls from dev/fakeRecordings.ts.
const FAKE_RECORDINGS = process.env.VITE_FAKE_RECORDINGS === "1";

export default defineConfig({
  plugins: [svelte(), ...(HTTPS ? [basicSsl()] : []), ...(FAKE_NODES ? [fakeNodes()] : []), ...(FAKE_RECORDINGS ? [fakeRecordings()] : [])],
  resolve: {
    alias: { $lib: fileURLToPath(new URL("./src/lib", import.meta.url)) },
    // Component tests mount Svelte in jsdom, which needs its browser build (only under vitest: it would change the dev server).
    ...(process.env.VITEST ? { conditions: ["browser"] } : {}),
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
