/* BlastGraph — dependency-free SVG drill-in for one changed symbol:
   symbol → callers → endpoints/crons. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { DownstreamImpact } from "@devdigest/shared";
import { layoutBlastGraph, type GraphNodeKind } from "./graph-layout";
import { s } from "./styles";

const STROKE: Record<GraphNodeKind, string> = {
  symbol: "var(--accent)",
  caller: "var(--border)",
  endpoint: "var(--accent)",
  cron: "var(--warn)",
};

const MAX_LABEL = 22;
const short = (label: string) => (label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label);

export function BlastGraph({ impact }: { impact: DownstreamImpact | undefined }) {
  const t = useTranslations("blast");
  if (!impact || impact.callers.length === 0) return <span style={s.muted}>{t("graph.empty")}</span>;

  const { nodes, edges, width, height } = layoutBlastGraph(impact);
  return (
    <div>
      <div style={s.graphWrap}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("graph.ariaLabel")}>
          {edges.map((e) => (
            <path
              key={e.id}
              d={e.path}
              fill="none"
              stroke="var(--text-muted)"
              strokeOpacity={0.5}
              strokeWidth={1.2}
              strokeDasharray={e.dashed ? "4 4" : undefined}
              data-dashed={e.dashed ? "true" : undefined}
            />
          ))}
          {nodes.map((n) => (
            <g key={n.id}>
              <rect
                x={n.x}
                y={n.y}
                width={n.width}
                height={n.height}
                rx={6}
                fill="var(--bg-elevated)"
                stroke={STROKE[n.kind]}
                strokeWidth={n.kind === "caller" ? 1 : 1.5}
              />
              <text
                x={n.x + n.width / 2}
                y={n.y + n.height / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11.5}
                fontFamily="var(--font-mono, monospace)"
                fill="var(--text-primary)"
              >
                <title>{n.label}</title>
                {short(n.kind === "symbol" ? `${n.label}()` : n.label)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div style={s.legend}>
        <span style={s.legendItem}>
          <span style={s.legendDot("var(--accent)")} />
          {t("graph.legend.symbol")}
        </span>
        <span style={s.legendItem}>
          <span style={s.legendDot("var(--text-muted)")} />
          {t("graph.legend.callers")}
        </span>
        <span style={s.legendItem}>
          <span style={s.legendDot("var(--accent)")} />
          {t("graph.legend.endpoints")}
        </span>
      </div>
    </div>
  );
}
