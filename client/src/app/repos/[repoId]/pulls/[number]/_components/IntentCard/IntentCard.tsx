/* IntentCard — the PR's classified intent on the Overview tab: summary,
   in/out of scope, the sources it was derived from, and re-detect. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, SectionLabel } from "@devdigest/ui";
import { usePrIntent, useRedetectIntent } from "../../../../../../../lib/hooks/intent";
import { CONFIDENCE_COLOR } from "./constants";
import { IntentSources } from "./IntentSources";
import { s } from "./styles";

function ScopeList({ kind, items }: { kind: "in" | "out"; items: string[] }) {
  const t = useTranslations("intent");
  const inScope = kind === "in";
  const HeadIcon = inScope ? Icon.Check : Icon.X;
  return (
    <div>
      <div style={s.colTitle(inScope)}>
        <HeadIcon size={13} />
        {inScope ? t("inScope") : t("outOfScope")}
      </div>
      {items.length > 0 ? (
        <ul style={s.list}>
          {items.map((i) => (
            <li key={i} style={s.item(inScope)}>
              <span style={s.dot} aria-hidden>
                ·
              </span>
              {i}
            </li>
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
        <p style={s.summary}>“{intent.summary}”</p>
        <div style={s.columns}>
          <ScopeList kind="in" items={intent.in_scope} />
          <ScopeList kind="out" items={intent.out_of_scope} />
        </div>
        {intent.confidence === "low" && (
          <div style={s.banner("var(--warn)")}>{t("lowBanner")}</div>
        )}
        {intent.missing_context.length > 0 && (
          <div style={s.banner("var(--warn)")}>
            {t("missingBanner")} {intent.missing_context.join("; ")}
          </div>
        )}
        {intent.sources.length > 0 && (
          <div style={s.footer}>
            <IntentSources sources={intent.sources} />
          </div>
        )}
      </>
    );
  }

  return (
    <section style={s.card}>
      <SectionLabel
        icon="Target"
        right={
          <div style={s.headerRight}>
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
        }
      >
        {t("title")}
      </SectionLabel>
      {content}
      {redetect.isError && <span style={s.muted}>{t("detectFailed")}</span>}
    </section>
  );
}
