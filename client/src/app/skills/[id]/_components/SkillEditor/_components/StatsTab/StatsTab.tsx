/* StatsTab — how a skill is used over the last 30 days of completed runs.
   Attribution is per RUN, not per skill: a run that carried several skills
   credits its findings to each of them (the caption says so). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CircularScore, Donut, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "../../../../../../../lib/hooks/skills";
import { DONUT_SIZE, RING_SIZE } from "./constants";
import { categoryRows, hasRunData } from "./helpers";
import { s } from "./styles";

const NO_VALUE = "—";

/** One metric tile. `aside` sits in the top-right corner (the accept-rate ring). */
function Tile({
  label,
  value,
  suffix,
  aside,
  single,
}: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
  aside?: React.ReactNode;
  single?: boolean;
}) {
  return (
    <div role="group" aria-label={label} style={single ? s.tileSingle : s.tile}>
      <div style={s.tileHead}>
        <span style={s.tileLabel}>{label}</span>
        {aside}
      </div>
      <div className="tnum" style={s.tileValue}>
        {value}
        {suffix && <span style={s.tileSuffix}>{suffix}</span>}
      </div>
    </div>
  );
}

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const stats = useSkillStats(skill.id);

  if (stats.isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={96} />
      </div>
    );
  }
  if (stats.isError || !stats.data) {
    return <ErrorState body={t("stats.loadError")} onRetry={() => void stats.refetch()} />;
  }

  const data = stats.data;
  const withRuns = hasRunData(data);
  const linked = data.used_by > 0 || data.agents.length > 0;
  const rows = categoryRows(data.by_category);
  const segments = rows
    .filter((row) => row.count > 0)
    .map((row) => ({ label: row.category, value: row.count, color: row.color }));

  return (
    <div style={s.wrap}>
      {(withRuns || linked) && (
        <div style={s.tiles}>
          <Tile
            label={t("stats.usedBy")}
            value={data.used_by}
            suffix={" " + t("stats.agentsUnit", { count: data.used_by })}
            single={!withRuns}
          />
          {withRuns && (
            <>
              <Tile
                label={t("stats.pullFrequency")}
                value={data.pull_pct ?? NO_VALUE}
                suffix={data.pull_pct === null ? undefined : "%"}
              />
              <Tile
                label={t("stats.acceptRate")}
                value={data.accept_pct ?? NO_VALUE}
                suffix={data.accept_pct === null ? undefined : "%"}
                aside={
                  data.accept_pct !== null && (
                    // Decorative: the ring repeats the number below it.
                    <span aria-hidden="true">
                      <CircularScore score={data.accept_pct} size={RING_SIZE} />
                    </span>
                  )
                }
              />
              <Tile label={t("stats.findings")} value={data.findings_30d} />
            </>
          )}
        </div>
      )}

      {(linked || withRuns) && (
        <div style={s.panels}>
          {linked && (
            <section style={s.panel}>
              <h3 style={s.panelTitle}>
                <Icon.Cpu size={14} />
                {t("stats.agentsTitle")}
              </h3>
              {data.agents.length === 0 ? (
                <div style={s.muted}>{t("stats.agentsEmpty")}</div>
              ) : (
                <ul style={s.agents}>
                  {data.agents.map((agent) => (
                    <li key={agent.id}>
                      <Link
                        href={`/agents/${agent.id}?tab=skills`}
                        aria-label={t("stats.openAgentAria", { name: agent.name })}
                        style={s.agentRow}
                      >
                        <span style={s.agentIcon}>
                          <Icon.Cpu size={14} />
                        </span>
                        <span style={s.agentName} title={agent.name}>
                          {agent.name}
                        </span>
                        <span className="mono" style={s.open}>
                          {t("stats.openAgent")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {withRuns && (
            <section style={s.panel}>
              <h3 style={s.panelTitle}>
                <Icon.Tag size={14} />
                {t("stats.byCategoryTitle")}
              </h3>
              {segments.length === 0 ? (
                <div style={s.muted}>{t("stats.byCategoryEmpty")}</div>
              ) : (
                <div style={s.chart}>
                  <div aria-hidden="true" style={s.donutClip}>
                    <Donut segments={segments} size={DONUT_SIZE} valuePrefix="" />
                  </div>
                  <ul style={s.legend} aria-label={t("stats.byCategoryTitle")}>
                    {rows.map((row) => (
                      <li key={row.category} style={s.legendRow}>
                        <span style={s.swatch(row.color)} />
                        <span style={s.legendLabel}>
                          {row.known ? t(`stats.category.${row.category}`) : row.category}
                        </span>
                        <span className="mono tnum" style={s.legendCount}>
                          {row.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {!withRuns && (
        <EmptyState
          icon="BarChart"
          title={t("stats.emptyTitle")}
          body={linked ? t("stats.emptyBodyLinked") : t("stats.emptyBody")}
        />
      )}

      <p style={s.caption}>{t("stats.attribution")}</p>
    </div>
  );
}
