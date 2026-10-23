"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { ReviewRecord, RunSummary } from "@devdigest/shared";
import { BlastRadiusCard } from "../BlastRadius";
import { IntentCard } from "../IntentCard";
import { PrBrief } from "../PrBrief";
import { ReviewFocus } from "../ReviewFocus";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  repoId: string;
  prBody: string | null | undefined;
  /** Persisted reviews, newest first. */
  reviews: ReviewRecord[];
  prRuns: RunSummary[] | undefined;
  repoFullName: string | null;
  headSha: string;
}

export function OverviewTab({ prId, repoId, prBody, reviews, prRuns, repoFullName, headSha }: OverviewTabProps) {
  const t = useTranslations("prReview");
  // The brief reflects the most recent review that produced a verdict.
  const latest = reviews.find((r) => r.kind === "review" && r.verdict);
  const latestRun = latest?.run_id ? prRuns?.find((r) => r.run_id === latest.run_id) : undefined;

  return (
    <div style={s.stack}>
      <PrBrief review={latest} run={latestRun} />
      {prId && <IntentCard prId={prId} />}
      {prId && (
        <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
      )}
      {latest && (
        <ReviewFocus findings={latest.findings} repoFullName={repoFullName} headSha={headSha} />
      )}
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">{t("overview.description")}</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </div>
  );
}
