"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s } from "./styles";

export type DiffOrder = "smart" | "original";

/** Segmented control: Smart order / Original order. */
export function OrderToggle({ value, onChange }: { value: DiffOrder; onChange: (v: DiffOrder) => void }) {
  const t = useTranslations("prReview");
  return (
    <div role="group" aria-label={t("smartDiff.orderToggleLabel")} style={s.segmented}>
      {(["smart", "original"] as const).map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          style={s.segment(value === o)}
        >
          {t(o === "smart" ? "smartDiff.smartOrder" : "smartDiff.originalOrder")}
        </button>
      ))}
    </div>
  );
}
