/* IntentCard — the PR's classified intent on the Overview tab: summary,
   in/out of scope, the sources it was derived from, and re-detect. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, SectionLabel } from "@devdigest/ui";
import { usePrIntent, useRedetectIntent } from "../../../../../../../lib/hooks/intent";
import { CONFIDENCE_COLOR } from "./constants";
import { IntentSources } from "./IntentSources";
import { s } from "./styles";

function ScopeList({ title, items }: { title: string; items: string[] }) {
  const t = useTranslations("intent");
  return (
    <div>
      <div style={s.colTitle}>{title}</div>
      {items.length > 0 ? (
        <ul style={s.list}>
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : (
        <span style={s.muted}>{t("none")}</span>
      )}
    </div>
  );
}

export function IntentCard({ prId }: { prId: string }) {
  const t = useTranslations("intent");
  const { data: intent, isLoading, isError } = usePrIntent(prId);
  const redetect = useRedetectIntent(prId);
  const busy = redetect.isPending;

  let content: React.ReactNode;
  if (isLoading) {
    content = <span style={s.muted}>{t("loading")}</span>;
  } else if (isError) {
    content = <span style={s.muted}>{t("error")}</span>;
  } else if (!intent) {
    content = <span style={s.muted}>{t("empty")}</span>;
  } else {
    content = (
      <>
        <p style={s.summary}>{intent.summary}</p>
        <div style={s.columns}>
          <ScopeList title={t("inScope")} items={intent.in_scope} />
          <ScopeList title={t("outOfScope")} items={intent.out_of_scope} />
        </div>
        {intent.confidence === "low" && (
          <div style={s.banner("var(--warn)")}>{t("lowBanner")}</div>
        )}
        {intent.missing_context.length > 0 && (
          <div style={s.banner("var(--warn)")}>
            {t("missingBanner")} {intent.missing_context.join("; ")}
          </div>
        )}
        <IntentSources sources={intent.sources} />
      </>
    );
  }

  return (
    <section style={s.card}>
      <div style={s.header}>
        <SectionLabel icon="Target">{t("title")}</SectionLabel>
        {intent && (
          <Badge color={CONFIDENCE_COLOR[intent.confidence]}>
            {t(`confidence.${intent.confidence}`)}
          </Badge>
        )}
        {intent?.stale && (
          <span title={t("staleHint")}>
            <Badge color="var(--warn)">{t("stale")}</Badge>
          </span>
        )}
        <span style={s.spacer} />
        <Button
          kind="ghost"
          size="sm"
          icon="RefreshCw"
          disabled={busy || isLoading}
          onClick={() => redetect.mutate()}
        >
          {busy ? t("detecting") : intent ? t("redetect") : t("detect")}
        </Button>
      </div>
      {content}
      {redetect.isError && <span style={s.muted}>{t("detectFailed")}</span>}
    </section>
  );
}
