"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import type { OnboardingFirstTask } from "@devdigest/shared";
import { s } from "./styles";

/** Informational cards only: no Open button, no click action (AC-52). */
export function FirstTasks({
  tasks,
  placeholder,
}: {
  /** null → not generated yet (skeleton). */
  tasks: OnboardingFirstTask[] | null;
  /** First generation running: bars instead of the "available once…" text. */
  placeholder: boolean;
}) {
  const t = useTranslations("onboarding");
  if (tasks === null) {
    return placeholder ? (
      <div role="status" aria-busy="true">
        <Skeleton height={56} />
      </div>
    ) : (
      <div style={s.pending}>{t("firstTasksPending")}</div>
    );
  }
  return (
    <div style={s.grid}>
      {tasks.map((task) => (
        <div key={`${task.path}-${task.title}`} style={s.card}>
          <div style={s.title}>{task.title}</div>
          <div className="mono" style={s.path}>
            {task.path}
          </div>
          <span style={s.badge(task.complexity)}>
            {t("complexity", { level: t(`complexityLevel.${task.complexity}`) })}
          </span>
        </div>
      ))}
    </div>
  );
}
