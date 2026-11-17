/**
 * A fake node API for dev and screenshots, until the real one lands (BE-4). A Vite dev middleware answering
 * /api/nodes* from memory, in the shapes of docs/node-protocol.md part 2. Start the dev server with
 *
 *     VITE_FAKE_NODES=1 npm run dev
 *
 * and Settings, Nodes shows one node in every state: ONLINE with a good link, ONLINE with a poor link and high lag,
 * OFFLINE, PENDING (key expires in 20 h) and REVOKED. Lag and link quality move with the clock; create, re-key,
 * revoke, patch and commands all work on the in-memory list (a restart of the dev server resets it). The
 * `restart` command times out and `squelch` above 30 dB is refused, to show both failure states.
 *
 * This is the only file that fakes the node API; delete it with the vite.config.ts hook when the real one is in.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { CommandResult, NodeCommand, NodeEvent, NodeHealth, SdrNode } from "../src/lib/types/nodes";

type FakeNode = SdrNode & { events: NodeEvent[]; secret: string };

const HOUR_MS = 3_600_000;
const iso = (ms: number): string => new Date(ms).toISOString();
const randomId = (): string => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

const tune = { center_hz: 160_890_000, rate: 1_536_000, gain_db: 36.4, squelch_db: 8 };

function health(cpu: number, temp: number | null, rtl: NodeHealth["rtl_tcp"], dropped: number): NodeHealth {
  return { cpu_pct: cpu, temp_c: temp, rtl_tcp: rtl, dropped_blocks: dropped, audio_age_ms: 120, uptime_s: 86_400 * 3, channels: 91, tune };
}

function makeNode(number: number, name: string, status: SdrNode["status"], lat: number, lon: number): FakeNode {
  const now = Date.now();
  return {
    id: `node-${randomId()}`, number, feed_id: `node-${number}`, name, location: { lat, lon }, preset: "aar", status,
    link_quality: null, lag_ms: null, last_seen: status === "PENDING" ? null : iso(now - 5_000), agent_version: status === "PENDING" ? null : "0.1.0",
    health: null, key_expires_at: status === "PENDING" ? iso(now + 20 * HOUR_MS) : null, created_at: iso(now - 9 * 24 * HOUR_MS),
    events: [{ t: iso(now - 9 * 24 * HOUR_MS), kind: "enrolled", detail: "enrolled" }], secret: "",
  };
}

const nodes: FakeNode[] = [
  makeNode(1, "Union Station roof", "ONLINE", 38.8973, -77.0063),
  makeNode(2, "Odenton shed", "ONLINE", 39.0841, -76.7003),
  makeNode(3, "Perryville", "OFFLINE", 39.5603, -76.0711),
  makeNode(4, "Newark depot", "PENDING", 39.6837, -75.7497),
  makeNode(5, "Old garage", "REVOKED", 38.9, -77.2),
];
nodes[0].health = health(31, 58.5, "connected", 0);
nodes[1].health = health(88, 82.4, "down", 412);
nodes[2].health = health(20, 49, "connected", 3);
nodes[2].last_seen = iso(Date.now() - 3 * HOUR_MS);
nodes[2].events.unshift({ t: iso(Date.now() - 3 * HOUR_MS), kind: "offline", detail: "heartbeat lost" });
nodes[1].events.unshift({ t: iso(Date.now() - 12 * 60_000), kind: "error", detail: "rtl_tcp down" }, { t: iso(Date.now() - 40 * 60_000), kind: "reconnect", detail: "reconnected after 8 s" });
nodes[0].events.unshift({ t: iso(Date.now() - 2 * HOUR_MS), kind: "online", detail: "connected" });
nodes[4].events.unshift({ t: iso(Date.now() - 24 * HOUR_MS), kind: "revoked", detail: "revoked in Settings" });

/** Link and lag that move: node 1 is a steady good link, node 2 a poor one with high lag. */
function motion(node: FakeNode): void {
  if (node.status !== "ONLINE") {
    node.link_quality = null;
    node.lag_ms = null;
    return;
  }
  const t = Date.now() / 1000;
  const wobble = Math.sin(t / 7 + node.number) + Math.sin(t / 3.1 + node.number * 2) * 0.4;
  const poor = node.number === 2;
  node.link_quality = Math.round(poor ? 34 + wobble * 8 : 92 + wobble * 4);
  node.lag_ms = Math.round(poor ? 1700 + wobble * 500 : 240 + wobble * 60);
  node.last_seen = iso(Date.now() - 1000);
}

function newKey(node: FakeNode): string {
  const secret = randomId() + randomId() + randomId() + randomId();
  node.secret = secret;
  const body = JSON.stringify({ url: "https://localhost", node: node.id, secret, v: 1 });
  return `sdrviz-node1.${Buffer.from(body).toString("base64url")}`;
}

function view(node: FakeNode): SdrNode {
  motion(node);
  const { events, secret, ...rest } = node;
  void events, secret; // not part of the public shape
  return rest;
}

function runCommand(node: FakeNode, id: string, command: NodeCommand): CommandResult {
  const fail = (code: string, message: string): CommandResult => ({ id, type: command.type, status: "failed", error: { code, message } });
  let result: CommandResult = { id, type: command.type, status: "acked", error: null };
  if (command.type === "restart") result = { id, type: "restart", status: "timeout", error: null };
  else if (command.type === "squelch" && command.squelch_db > 30) result = fail("bad_value", "squelch_db must be 30 or less");
  else if (command.type === "squelch" && node.health) node.health.tune = { ...node.health.tune, squelch_db: command.squelch_db };
  else if (command.type === "gain" && node.health) node.health.tune = { ...node.health.tune, gain_db: command.gain_db };
  node.events.unshift({ t: iso(Date.now()), kind: result.status === "acked" ? "command" : "error", detail: `${command.type} ${result.status}` });
  return result;
}

function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let text = "";
    request.on("data", (chunk) => (text += chunk));
    request.on("end", () => resolve(text ? JSON.parse(text) : {}));
  });
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

async function handle(method: string, parts: string[], body: Record<string, unknown>): Promise<[number, unknown]> {
  const [, id, action] = parts;
  if (!id) {
    if (method === "GET") return [200, nodes.map(view)];
    const node = makeNode(Math.max(0, ...nodes.map((n) => n.number)) + 1, String(body.name ?? "New node"), "PENDING", 0, 0);
    Object.assign(node, { location: body.location ?? node.location, preset: body.preset ?? "aar" });
    nodes.push(node);
    return [201, { node: view(node), key: newKey(node) }];
  }
  const node = nodes.find((n) => n.id === id);
  if (!node) return [404, { detail: "unknown node" }];
  if (!action && method === "GET") return [200, { ...view(node), events: node.events.slice(0, 50) }];
  if (!action && method === "PATCH") return [200, view(Object.assign(node, body))];
  if (action === "rekey") {
    node.status = node.status === "REVOKED" ? "PENDING" : node.status;
    node.key_expires_at = iso(Date.now() + 24 * HOUR_MS);
    node.events.unshift({ t: iso(Date.now()), kind: "rekeyed", detail: "new key issued" });
    return [200, { node: view(node), key: newKey(node) }];
  }
  if (action === "revoke") {
    if (node.status !== "REVOKED") node.events.unshift({ t: iso(Date.now()), kind: "revoked", detail: "revoked in Settings" });
    Object.assign(node, { status: "REVOKED", key_expires_at: null });
    return [200, view(node)];
  }
  if (action === "commands" && method === "POST") {
    if (node.status !== "ONLINE") return [409, { detail: "node is not ONLINE" }];
    return [200, runCommand(node, `cmd-${randomId()}`, body as unknown as NodeCommand)];
  }
  return [404, { detail: "not found" }];
}

/** Vite plugin: serves /api/nodes* from memory before the dev proxy sees the request. */
export function fakeNodes(): Plugin {
  return {
    name: "sdrviz-fake-nodes",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (url.pathname !== "/api/nodes" && !url.pathname.startsWith("/api/nodes/")) return next();
        const parts = url.pathname.split("/").slice(2); // ["nodes", id?, action?]
        const [status, body] = await handle(request.method ?? "GET", parts, await readBody(request));
        send(response, status, body);
      });
    },
  };
}
