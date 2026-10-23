/* BlastRadiusCard — what else in the repo the PR's changed symbols can affect:
   stats, a collapsible tree (default) and a graph drill-in. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { useBlastRadius } from "../../../../../../../lib/hooks/blast";
import { useRepoIntelStatus, useResyncRepoIntel } from "../../../../../../../lib/hooks/repo-intel";
import { BlastGraph } from "./BlastGraph";
import { BlastTree } from "./BlastTree";
import { blastStats } from "./helpers";
import { s } from "./styles";

type View = "tree" | "graph";

interface BlastRadiusCardProps {
  prId: string;
  repoId: string;
  repoFullName: string | null;
  headSha: string;
}

export function BlastRadiusCard({ prId, repoId, repoFullName, headSha }: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const qc = useQueryClient();
  const { data, isLoading, isError } = useBlastRadius(prId);

  const [view, setView] = React.useState<View>("tree");
  // null = nothing explicitly toggled yet → the first symbol is expanded/selected.
  const [expanded, setExpanded] = React.useState<Set<string> | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);

  // Rebuild: remember the index's updatedAt at click time; poll until it advances.
  const resync = useResyncRepoIntel(repoId);
  const [baseline, setBaseline] = React.useState<string | null>(null);
  const waiting = baseline !== null;
  const { data: indexState } = useRepoIntelStatus(repoId, waiting);
  React.useEffect(() => {
    if (baseline !== null && indexState && indexState.updatedAt !== baseline) {
      setBaseline(null);
      qc.invalidateQueries({ queryKey: ["pr-blast", prId] });
    }
  }, [baseline, indexState, qc, prId]);

  const onResync = () => {
    setBaseline(indexState?.updatedAt ?? "");
    resync.mutate(undefined, { onError: () => setBaseline(null) });
  };

  const downstream = data?.downstream ?? [];
  const firstSymbol = downstream[0]?.symbol ?? null;
  const expandedSet = expanded ?? new Set(firstSymbol ? [firstSymbol] : []);
  const activeSymbol =
    selected && downstream.some((d) => d.symbol === selected) ? selected : firstSymbol;

  const onToggle = (symbol: string) => {
    const next = new Set(expandedSet);
    if (next.has(symbol)) next.delete(symbol);
    else next.add(symbol);
    setExpanded(next);
    setSelected(symbol);
  };

  const stats = data ? blastStats(data) : null;

  let body: React.ReactNode;
  if (isLoading) {
    body = <Skeleton height={80} />;
  } else if (isError || !data || !stats) {
    body = <span style={s.muted}>{t("error")}</span>;
  } else {
    let content: React.ReactNode;
    if (data.changed_symbols.length === 0) {
      content = <span style={s.muted}>{t("noSymbols")}</span>;
    } else if (downstream.length === 0) {
      content = <span style={s.muted}>{t("noDownstream", { count: data.changed_symbols.length })}</span>;
    } else if (view === "tree") {
      content = (
        <BlastTree
          downstream={downstream}
          expanded={expandedSet}
          selected={activeSymbol}
          repoFullName={repoFullName}
          headSha={headSha}
          onToggle={onToggle}
        />
      );
    } else {
      content = <BlastGraph impact={downstream.find((d) => d.symbol === activeSymbol)} />;
    }

    body = (
      <>
        {data.degraded && data.reason && (
          <div style={s.notice} role="status">
            <span style={s.noticeText}>{t(`degraded.${data.reason}`)}</span>
            {data.reason !== "no_changed_files" && (
              <Button kind="ghost" size="sm" icon="RefreshCw" disabled={waiting || resync.isPending} onClick={onResync}>
                {waiting || resync.isPending ? t("action.resyncing") : t("action.resync")}
              </Button>
            )}
          </div>
        )}
        <div style={s.statRow}>
          <span style={s.stat}>
            <Icon.Code size={13} />
            <span style={s.statNum}>{stats.symbols}</span> {t("stat.symbols")}
          </span>
          <span style={s.stat}>
            <Icon.CornerDownRight size={13} />
            <span style={s.statNum}>{stats.callers}</span> {t("stat.callers")}
          </span>
          <span style={s.stat}>
            <Icon.Globe size={13} />
            <span style={s.statNum}>{stats.endpoints}</span> {t("stat.endpoints")}
          </span>
          <span style={s.stat}>
            <Icon.Clock size={13} />
            <span style={s.statNum}>{stats.crons}</span> {t("stat.crons")}
          </span>
          <span style={s.spacer} />
          <div style={s.toggle} role="group">
            {(["tree", "graph"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                style={s.toggleBtn(view === v)}
                onClick={() => setView(v)}
              >
                {t(`view.${v}`)}
              </button>
            ))}
          </div>
        </div>
        {content}
      </>
    );
  }

  return (
    <section style={s.card}>
      <div style={s.header}>
        <SectionLabel
          icon="Boxes"
          right={
            stats ? (
              <span style={s.muted}>
                {t("headerSummary", { callers: stats.callers, endpoints: stats.endpoints })}
              </span>
            ) : undefined
          }
        >
          {t("title")}
        </SectionLabel>
      </div>
      <div style={s.body}>{body}</div>
    </section>
  );
}
