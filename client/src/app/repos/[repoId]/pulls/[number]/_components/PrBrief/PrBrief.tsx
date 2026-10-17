/* PrBrief — top of the Overview tab: the latest review's verdict, summary,
   finding/blocker counts and score, plus that run's cost and token usage. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SectionLabel } from "@devdigest/ui";
import type { ReviewRecord, RunSummary } from "@devdigest/shared";
import { formatCost } from "../../../../../../../lib/format-cost";
import { formatTokens } from "../../../../../../../lib/format-tokens";
import { VerdictBanner } from "../VerdictBanner";
import { s } from "./styles";

interface PrBriefProps {
  review: ReviewRecord | undefined;
  run: RunSummary | undefined;
}

export function PrBrief({ review, run }: PrBriefProps) {
  const t = useTranslations("brief");

  if (!review?.verdict) {
    return (
      <section>
        <SectionLabel icon="FileText">{t("title")}</SectionLabel>
        <div style={s.empty}>{t("noReview")}</div>
      </section>
    );
  }

  const open = review.findings.filter((f) => !f.dismissed_at);
  // Same blocker rule as ReviewRunAccordion: undismissed CRITICAL findings.
  const blockers = open.filter((f) => f.severity === "CRITICAL").length;
  const cost = run?.cost_usd ?? review.cost_usd;
  const hasTokens = run?.tokens_in != null && run?.tokens_out != null;

  const meta =
    cost != null || hasTokens ? (
      <>
        {cost != null && (
          <span style={s.metaValue}>
            <Icon.DollarSign size={12} />
            {formatCost(cost)}
          </span>
        )}
        {hasTokens && (
          <span title={t("tokens", { in: run!.tokens_in!, out: run!.tokens_out! })}>
            {formatTokens(run!.tokens_in)}→{formatTokens(run!.tokens_out)}
          </span>
        )}
      </>
    ) : null;

  return (
    <section>
      <SectionLabel icon="FileText">{t("title")}</SectionLabel>
      <VerdictBanner
        verdict={review.verdict}
        summary={review.summary}
        score={review.score}
        findingsCount={open.length}
        blockers={blockers}
        meta={meta}
      />
    </section>
  );
}
