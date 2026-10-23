/* SkillContextTab — which repo documents this skill carries; any agent using
   the skill inherits them. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ContextAttachTab } from "@/components/context-docs";
import { useSetSkillContext, useSkillContext } from "@/lib/hooks/context";
import { s } from "./styles";

export function SkillContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("context");
  const attachments = useSkillContext(skill.id);
  const setContext = useSetSkillContext(skill.id);

  if (attachments.isLoading) return <Skeleton height={44} />;
  if (attachments.isError) return <ErrorState title={t("attach.loadError")} onRetry={() => attachments.refetch()} />;

  return (
    <ContextAttachTab
      attachments={attachments.data ?? []}
      onSave={(paths) => setContext.mutateAsync(paths)}
      title={t("attach.title")}
      note={t("attach.skillNote")}
      footer={({ paths, tokens }) => (
        <>
          <div style={s.label}>{t("attach.serializesAs")}</div>
          <pre className="mono" style={s.pre}>
            {paths.length === 0 ? t("attach.serializesEmpty") : ["## Project context", ...paths].join("\n")}
          </pre>
          <div style={s.tokens}>{t("tokens", { count: tokens })}</div>
        </>
      )}
    />
  );
}
