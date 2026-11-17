/** Nodes: the REST shapes of docs/node-protocol.md, part 2. Times are ISO 8601 strings. */

export type NodeStatus = "PENDING" | "ONLINE" | "OFFLINE" | "REVOKED";
export type RtlTcpState = "connected" | "connecting" | "down";

export interface NodeLocation {
  lat: number;
  lon: number;
}

export interface NodeTune {
  center_hz: number;
  rate: number;
  /** null is automatic gain */
  gain_db: number | null;
  squelch_db: number;
}

/** The last `health` message the node sent. */
export interface NodeHealth {
  cpu_pct: number;
  temp_c: number | null;
  rtl_tcp: RtlTcpState;
  dropped_blocks: number;
  audio_age_ms: number;
  uptime_s: number;
  channels: number;
  tune: NodeTune;
}

export interface SdrNode {
  id: string;
  number: number;
  /** the spectrum feed to watch on /ws/live */
  feed_id: string;
  name: string;
  location: NodeLocation;
  preset: string;
  status: NodeStatus;
  /** 0-100, only while ONLINE */
  link_quality: number | null;
  /** only while ONLINE */
  lag_ms: number | null;
  last_seen: string | null;
  agent_version: string | null;
  health: NodeHealth | null;
  /** only PENDING: when the current key stops working */
  key_expires_at: string | null;
  created_at: string;
}

export type NodeEventKind = "enrolled" | "online" | "offline" | "reconnect" | "rekeyed" | "revoked" | "command" | "error";

export interface NodeEvent {
  t: string;
  kind: NodeEventKind;
  detail: string;
}

/** `GET /nodes/{id}`: the node and its last 50 events, newest first. */
export type NodeDetail = SdrNode & { events: NodeEvent[] };

export interface NewNode {
  name: string;
  location: NodeLocation;
  preset?: string;
}

/** The answer to create and re-key: the node key is shown once, never returned again. */
export interface NodeWithKey {
  node: SdrNode;
  key: string;
}

export type NodeCommand =
  | { type: "tune"; center_hz: number; rate: number }
  | { type: "gain"; gain_db: number | null }
  | { type: "squelch"; squelch_db: number }
  | { type: "channels"; channels: number[] }
  | { type: "restart" }
  | { type: "set_server"; url: string };

export interface CommandResult {
  id: string;
  type: NodeCommand["type"];
  status: "acked" | "failed" | "timeout";
  error: { code: string; message: string } | null;
}
