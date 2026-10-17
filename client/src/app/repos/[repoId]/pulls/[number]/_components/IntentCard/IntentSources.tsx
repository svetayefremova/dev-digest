"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { IntentSource } from "@devdigest/shared";
import { SOURCE_STATUS_MARK } from "./constants";
import { s } from "./styles";

export function IntentSources({ sources }: { sources: IntentSource[] }) {
  const t = useTranslations("intent");
  if (sources.length === 0) return null;
  return (
    <div style={s.sourceRow} aria-label={t("sources")}>
      {sources.map((src) => (
        <span
          key={`${src.kind}:${src.ref}`}
          style={s.chip(src.status !== "unavailable")}
          title={src.reason ?? undefined}
        >
          {src.ref} {SOURCE_STATUS_MARK[src.status]}
          {src.status === "unavailable" ? ` ${t("unavailable")}` : ""}
          {src.status === "truncated" ? ` (${t("truncated")})` : ""}
        </span>
      ))}
    </div>
  );
}
