/* FindingsNotInDiff — findings whose line isn't in the patch, listed under the file
   so none are dropped. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { cs } from "../comments";

export function FindingsNotInDiff({
  findings,
  render,
}: {
  findings: FindingRecord[];
  render: (f: FindingRecord) => React.ReactNode;
}) {
  const t = useTranslations("shell");
  if (findings.length === 0) return null;
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>
        {t("diffViewer.findingsNotInDiff", { count: findings.length })}
      </span>
      {findings.map((f) => (
        <div key={f.id}>{render(f)}</div>
      ))}
    </div>
  );
}
