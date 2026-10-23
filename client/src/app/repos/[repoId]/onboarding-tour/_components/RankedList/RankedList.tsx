"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { OnboardingRankedList } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { showTruncationNote, hasToggle, visibleEntries } from "./helpers";
import { s } from "./styles";

export function RankedList({
  list,
  repoFullName,
  indexedSha,
  filesIndexed,
  emptyText,
  numbered = false,
}: {
  list: OnboardingRankedList;
  repoFullName: string;
  /** '' for a no-data index: "Open" is then not rendered. */
  indexedSha: string;
  filesIndexed: number;
  emptyText?: string;
  numbered?: boolean;
}) {
  const t = useTranslations("onboarding");
  const format = useFormatter();
  const [expanded, setExpanded] = React.useState(false);

  if (list.entries.length === 0) return emptyText ? <div style={s.empty}>{emptyText}</div> : null;

  const rows = visibleEntries(list.entries, expanded);
  return (
    <div>
      <ul style={s.list}>
        {rows.map((entry, i) => {
          const facts = [
            entry.importers > 0 ? t("factImporters", { count: entry.importers }) : null,
            entry.endpoints > 0 ? t("factEndpoints", { count: entry.endpoints }) : null,
          ].filter(Boolean);
          return (
            <li key={entry.path} style={s.row}>
              {numbered && <span style={s.rank}>{i + 1}</span>}
              <span style={s.text}>
                <span className="mono" style={s.path} title={entry.path}>
                  {entry.path}
                </span>
                {entry.reason ? ` — ${entry.reason}` : null}
                {facts.length > 0 && <span style={s.fact}> · {facts.join(" · ")}</span>}
              </span>
              {indexedSha !== "" && (
                <a
                  href={githubBlobUrl(repoFullName, indexedSha, entry.path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={s.open}
                >
                  {t("open")}
                </a>
              )}
            </li>
          );
        })}
      </ul>
      {hasToggle(list.entries) && (
        <button type="button" style={s.toggle} onClick={() => setExpanded((v) => !v)}>
          {expanded ? t("showLess") : t("showAll", { count: list.entries.length })}
        </button>
      )}
      {showTruncationNote(list.truncated, expanded, list.entries) && (
        <div style={s.note}>{t("truncationNote", { total: format.number(filesIndexed) })}</div>
      )}
    </div>
  );
}
