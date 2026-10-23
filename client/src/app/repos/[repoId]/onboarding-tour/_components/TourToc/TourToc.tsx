"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingSectionKey } from "@devdigest/shared";
import { s } from "./styles";

export function TourToc({
  keys,
  active,
  onSelect,
}: {
  keys: readonly OnboardingSectionKey[];
  active: OnboardingSectionKey;
  onSelect: (key: OnboardingSectionKey) => void;
}) {
  const t = useTranslations("onboarding");
  return (
    <nav style={s.nav} aria-label={t("onThisPage")}>
      <div style={s.label}>{t("onThisPage")}</div>
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          style={s.item(key === active)}
          aria-current={key === active ? "location" : undefined}
          onClick={() => onSelect(key)}
        >
          {t(`sections.${key}`)}
        </button>
      ))}
    </nav>
  );
}
