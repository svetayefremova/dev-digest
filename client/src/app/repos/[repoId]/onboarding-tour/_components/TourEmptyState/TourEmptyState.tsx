"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

/** No persisted tour: one CTA, no model call until it is clicked (AC-39). */
export function TourEmptyState({ onGenerate, loading }: { onGenerate: () => void; loading: boolean }) {
  const t = useTranslations("onboarding");
  return (
    <EmptyState
      icon="Boxes"
      title={t("empty.title")}
      body={t("empty.body")}
      cta={t("empty.cta")}
      onCta={onGenerate}
      ctaLoading={loading}
    />
  );
}
