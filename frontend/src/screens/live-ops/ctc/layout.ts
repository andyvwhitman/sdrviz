/**
 * CTC track strip layout (spec 5.30 M18), ported from ctcHTML in design/mockups/live-ops.js.
 * Five 24 px rows; NEC is spaced evenly across the strip and the other routes hang off their
 * junctions at NEC spacing. Pure: routes in, nodes, ties, blocks and label candidates out.
 */

import { trainId } from "$lib/hud/fmt";
import type { LabelCandidate } from "./labelPass";

/** Row order of the strip. */
export const ROUTE_ORDER = ["r-nec", "r-capital", "r-metro", "r-manassas", "r-phila"] as const;
export const ROW_PX = 24;
/** track and markers sit in the top 11 px of a row; labels below, on baseline 21 */
export const TRACK_Y = 6.5;
export const BASELINE_Y = 21;
const BLOCK_INSET_PX = 5;
const RIGHT_MARGIN_PX = 16;

export interface RoutePoint {
  place_id: string;
  name: string;
  kind: string;
  route_mi: number;
  mp_label: string;
  short?: string;
}

export interface RouteDef {
  id: string;
  name: string;
  points: RoutePoint[];
}

export interface Junction {
  place_id: string;
  routes: string[];
}

export interface RoutesDoc {
  routes: RouteDef[];
  junctions: Junction[];
}

export interface CtcTrain {
  train_id: string;
  route_mi: number;
  talking: boolean;
}

export interface CtcLive {
  trains: CtcTrain[];
  detectors_talking: unknown[];
}

export interface CtcNode extends RoutePoint {
  x: number;
  /** [native, other] mileposts when consecutive points share a place (an MP equation) */
  equation?: [string, string];
}

export interface CtcRow {
  id: string;
  name: string;
  index: number;
  nodes: CtcNode[];
}

export interface Tie {
  x: number;
  from: number;
  to: number;
}

export interface Block {
  row: number;
  x0: number;
  x1: number;
  talking: boolean;
  trainId: string;
}

const half = (v: number): number => Math.round(v) + 0.5;

/** Consecutive points at one place (MP equations) collapse into one node carrying both mileposts. */
function mergeNodes(points: RoutePoint[]): CtcNode[] {
  const nodes: CtcNode[] = [];
  for (const point of points) {
    const last = nodes[nodes.length - 1];
    if (last && last.place_id === point.place_id) last.equation = [last.mp_label, point.mp_label];
    else nodes.push({ ...point, x: 0 });
  }
  return nodes;
}

const place = (nodes: CtcNode[], startX: number, spacing: number): void => nodes.forEach((n, i) => (n.x = startX + i * spacing));

export interface CtcLayout {
  rows: CtcRow[];
  ties: Tie[];
}

export function layoutCtc(doc: RoutesDoc, width: number, x0: number): CtcLayout {
  const byId = new Map(doc.routes.map((r) => [r.id, r]));
  const rows: CtcRow[] = ROUTE_ORDER.flatMap((id, index) => {
    const route = byId.get(id);
    return route ? [{ id, name: route.name, index, nodes: mergeNodes(route.points) }] : [];
  });
  const nodesOf = (id: string) => rows.find((r) => r.id === id)?.nodes ?? [];

  const nec = nodesOf("r-nec");
  const spacing = (width - RIGHT_MARGIN_PX - x0) / Math.max(1, nec.length - 1);
  place(nec, x0, spacing);
  const necX = (placeId: string): number => x0 + Math.max(0, nec.findIndex((n) => n.place_id === placeId)) * spacing;

  const washington = necX("wash-union");
  const alexandria = necX("alexandria");
  const baltimore = necX("baltimore-penn");
  const capital = nodesOf("r-capital");
  const manassas = nodesOf("r-manassas");
  place(capital, washington, (baltimore - washington) / Math.max(1, capital.length - 1));
  place(nodesOf("r-metro"), washington, spacing);
  place(manassas, alexandria - (manassas.length - 1) * spacing, spacing);
  place(nodesOf("r-phila"), baltimore, spacing);

  const ties = doc.junctions.flatMap((j): Tie[] => {
    const indices = j.routes.map((id) => ROUTE_ORDER.indexOf(id as (typeof ROUTE_ORDER)[number])).filter((i) => i >= 0).sort((a, b) => a - b);
    return indices.length < 2 ? [] : [{ x: half(necX(j.place_id)), from: indices[0], to: indices[indices.length - 1] }];
  });
  return { rows, ties };
}

/** Occupied blocks: tracked passenger trains only (freight is never positioned). */
export function blocksFor(layout: CtcLayout, live: Record<string, CtcLive | undefined>): Block[] {
  return layout.rows.flatMap((row) =>
    (live[row.id]?.trains ?? []).flatMap((train): Block[] => {
      const { nodes } = row;
      if (nodes.length < 2) return [];
      let i = nodes.findIndex((n, k) => k < nodes.length - 1 && n.route_mi <= train.route_mi && nodes[k + 1].route_mi > train.route_mi);
      if (i < 0) i = train.route_mi >= nodes[nodes.length - 1].route_mi ? nodes.length - 2 : 0;
      return [{ row: row.index, x0: nodes[i].x + BLOCK_INSET_PX, x1: nodes[i + 1].x - BLOCK_INSET_PX, talking: train.talking, trainId: trainId(train.train_id) }];
    }),
  );
}

/** Place ids of detectors with a talker right now. */
export function talkingDetectors(live: Record<string, CtcLive | undefined>): Set<string> {
  const out = new Set<string>();
  for (const route of Object.values(live)) {
    for (const d of route?.detectors_talking ?? []) out.add(typeof d === "string" ? d : String((d as { place_id?: string }).place_id));
  }
  return out;
}

/** "Washington Union Station" -> "WASHINGTON UNION"; "Lorton (VRE)" -> "LORTON" */
export const stationName = (name: string): string => name.replace(/\s*\(.*\)$/, "").replace(/ Station$/, "").toUpperCase();

/** "≈CFP 112.6" + "NEC 135.7" -> "CFP≈ | NEC 135.7" */
export const equationText = ([native, other]: [string, string]): string => `${native.replace(/\s*[\d.]+$/, "").replace(/^≈(.*)$/, "$1≈")} | ${other}`;

export function labelCandidates(layout: CtcLayout, blocks: readonly Block[]): LabelCandidate[] {
  const out: LabelCandidate[] = [];
  const tieAt = (row: number, x: number): number | undefined => layout.ties.find((t) => row >= t.from && row <= t.to && Math.abs(t.x - half(x)) < 1)?.x;

  for (const row of layout.rows) {
    out.push({ row: row.index, priority: 0, text: row.name, font: "route", x: 0, anchor: "start" });
    for (const block of blocks.filter((b) => b.row === row.index)) {
      out.push({
        row: row.index,
        priority: block.talking ? 1 : 2,
        text: block.trainId,
        font: "train",
        x: (block.x0 + block.x1) / 2,
        anchor: "middle",
        talking: block.talking,
      });
    }
    row.nodes.forEach((node, i) => {
      if (node.equation) {
        out.push({ row: row.index, priority: 3, text: equationText(node.equation), font: "equation", x: node.x, anchor: "middle", tie: tieAt(row.index, node.x) });
      } else if (node.kind === "station" || node.kind === "yard") {
        const reach = [row.nodes[i - 1], row.nodes[i + 1]].map((m) => (m ? Math.abs(m.x - node.x) * 0.75 : 1e4));
        out.push({
          row: row.index,
          priority: 4,
          text: stationName(node.name),
          font: "station",
          x: node.x,
          anchor: "middle",
          tie: tieAt(row.index, node.x),
          short: node.short?.toUpperCase(),
          reach: [reach[0], reach[1]],
        });
      }
    });
  }
  return out;
}
