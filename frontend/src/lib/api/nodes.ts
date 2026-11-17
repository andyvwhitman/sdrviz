/** The node REST API (docs/node-protocol.md, part 2). Behind the session cookie like the rest of /api. */

import type { CommandResult, NewNode, NodeCommand, NodeDetail, NodeWithKey, SdrNode } from "$lib/types/nodes";
import { http } from "./client";

const path = (id: string) => `/nodes/${encodeURIComponent(id)}`;

export const nodesApi = {
  list: () => http.get<SdrNode[]>("/nodes"),
  create: (node: NewNode) => http.post<NodeWithKey>("/nodes", node),
  get: (id: string) => http.get<NodeDetail>(path(id)),
  patch: (id: string, changes: Partial<NewNode>) => http.patch<SdrNode>(path(id), changes),
  rekey: (id: string) => http.post<NodeWithKey>(`${path(id)}/rekey`),
  revoke: (id: string) => http.post<SdrNode>(`${path(id)}/revoke`),
  command: (id: string, command: NodeCommand) => http.post<CommandResult>(`${path(id)}/commands`, command),
};
