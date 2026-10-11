/* AgentCard — one row of the Agents sidebar: name, enabled toggle, description,
   model chip + skills count, and a 30-day usage footer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useDeleteAgent } from "../../../../lib/hooks/agents";
import { formatCost } from "@/lib/format-cost";
import { modelColor } from "./helpers";
import { s } from "./styles";

export function AgentCard({
  ag,
  active,
  skillCount,
  onClick,
  onToggle,
}: {
  ag: Agent;
  active?: boolean;
  skillCount?: number;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("agents");
  const del = useDeleteAgent();
  const color = modelColor(ag.model);
  const { usage } = ag;
  // No footer before the first run; a metric with no data is left out, not shown as 0.
  const footer =
    usage && usage.runs > 0
      ? [
          t("card.runs", { count: usage.runs }),
          usage.accept_pct != null ? t("card.accept", { pct: usage.accept_pct }) : null,
          usage.avg_cost_usd != null ? t("card.avgCost", { cost: formatCost(usage.avg_cost_usd) }) : null,
        ].filter((part): part is string => part !== null)
      : [];
  return (
    <div onClick={onClick} style={s.card(!!active, ag.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Cpu size={15} />
        </div>
        <span style={s.name}>{ag.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={ag.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete agent "${ag.name}"? This cannot be undone.`)) del.mutate(ag.id);
          }}
          disabled={del.isPending}
          title="Delete agent"
          aria-label="Delete agent"
          style={{
            background: "none",
            border: "none",
            cursor: del.isPending ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{ag.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.modelChip(color)} title={ag.model}>
          {ag.model}
        </span>
        {skillCount != null && (
          <Badge color="var(--text-secondary)" icon="Sparkles" style={s.skillsBadge}>
            {t("card.skillCount", { count: skillCount })}
          </Badge>
        )}
      </div>
      {footer.length > 0 && (
        <div className="tnum" style={s.footer}>
          {footer.join(" · ")}
        </div>
      )}
    </div>
  );
}
