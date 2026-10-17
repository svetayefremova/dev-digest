"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";

export type DiffOrder = "smart" | "original";

export function OrderToggle({ value, onChange }: { value: DiffOrder; onChange: (v: DiffOrder) => void }) {
  const t = useTranslations("prReview");
  return (
    <div role="group" aria-label={t("smartDiff.orderToggleLabel")} style={{ display: "inline-flex", gap: 4 }}>
      {(["smart", "original"] as const).map((o) => (
        <Button
          key={o}
          size="sm"
          kind={value === o ? "secondary" : "ghost"}
          aria-pressed={value === o}
          onClick={() => onChange(o)}
        >
          {t(o === "smart" ? "smartDiff.smartOrder" : "smartDiff.originalOrder")}
        </Button>
      ))}
    </div>
  );
}
