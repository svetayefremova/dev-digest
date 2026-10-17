/* ReviewFocus — "read these first": the latest review's open blocker and
   warning findings as file:line jump links (GitHub blob at the PR head). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SectionLabel } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { githubBlobUrl } from "../../../../../../../lib/github-urls";
import { pickFocusFindings } from "./helpers";
import { s } from "./styles";

interface ReviewFocusProps {
  findings: FindingRecord[];
  repoFullName: string | null;
  headSha: string;
}

export function ReviewFocus({ findings, repoFullName, headSha }: ReviewFocusProps) {
  const t = useTranslations("brief");
  const focus = pickFocusFindings(findings);
  if (focus.length === 0) return null;

  return (
    <section style={s.card}>
      <SectionLabel icon="ListChecks">
        {t("focus.title")} <span style={s.count}>{focus.length}</span>
      </SectionLabel>
      <ul style={s.list}>
        {focus.map((f) => {
          const ref = `${f.file}:${f.start_line}`;
          return (
            <li key={f.id} style={s.item}>
              <Icon.ChevronRight size={12} style={s.bullet} aria-hidden />
              {repoFullName ? (
                <a
                  href={githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)}
                  target="_blank"
                  rel="noreferrer"
                  style={s.ref}
                >
                  {ref}
                </a>
              ) : (
                <span style={s.ref}>{ref}</span>
              )}
              <span>— {f.title}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
