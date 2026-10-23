import type { DownstreamImpact } from "@devdigest/shared";

export type GraphNodeKind = "symbol" | "caller" | "endpoint" | "cron";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  /** symbol → endpoint/cron edges are symbol-level, so they are dashed. */
  dashed: boolean;
  path: string;
}

export interface BlastGraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

const NODE_W = 160;
const NODE_H = 28;
const ROW_GAP = 14;
const COL_GAP = 90;
const PAD = 12;

function curve(a: GraphNode, b: GraphNode): string {
  const x1 = a.x + a.width;
  const y1 = a.y + a.height / 2;
  const x2 = b.x;
  const y2 = b.y + b.height / 2;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

/** Three columns: changed symbol → callers → endpoints/crons. Pure. */
export function layoutBlastGraph(impact: DownstreamImpact): BlastGraphLayout {
  const targets: Array<{ kind: "endpoint" | "cron"; label: string }> = [
    ...impact.endpoints_affected.map((label) => ({ kind: "endpoint" as const, label })),
    ...impact.crons_affected.map((label) => ({ kind: "cron" as const, label })),
  ];
  const rows = Math.max(impact.callers.length, targets.length, 1);
  const colHeight = (n: number) => n * NODE_H + (n - 1) * ROW_GAP;
  const height = colHeight(rows) + PAD * 2;
  const colX = (i: number) => PAD + i * (NODE_W + COL_GAP);
  const startY = (n: number) => PAD + (colHeight(rows) - colHeight(n)) / 2;

  const symbol: GraphNode = {
    id: "symbol",
    kind: "symbol",
    label: impact.symbol,
    x: colX(0),
    y: startY(1),
    width: NODE_W,
    height: NODE_H,
  };
  const callers: GraphNode[] = impact.callers.map((c, i) => ({
    id: `caller:${i}`,
    kind: "caller",
    label: c.name,
    x: colX(1),
    y: startY(impact.callers.length) + i * (NODE_H + ROW_GAP),
    width: NODE_W,
    height: NODE_H,
  }));
  const targetNodes: GraphNode[] = targets.map((t, i) => ({
    id: `${t.kind}:${i}`,
    kind: t.kind,
    label: t.label,
    x: colX(2),
    y: startY(targets.length) + i * (NODE_H + ROW_GAP),
    width: NODE_W,
    height: NODE_H,
  }));

  const edges: GraphEdge[] = [
    ...callers.map((c) => ({
      id: `${symbol.id}->${c.id}`,
      from: symbol.id,
      to: c.id,
      dashed: false,
      path: curve(symbol, c),
    })),
    ...targetNodes.map((t) => ({
      id: `${symbol.id}->${t.id}`,
      from: symbol.id,
      to: t.id,
      dashed: true,
      path: curve(symbol, t),
    })),
  ];

  return {
    nodes: [symbol, ...callers, ...targetNodes],
    edges,
    width: colX(2) + NODE_W + PAD,
    height,
  };
}
