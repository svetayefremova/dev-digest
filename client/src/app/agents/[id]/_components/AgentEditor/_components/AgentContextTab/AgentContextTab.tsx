/* AgentContextTab — which repo documents this agent injects into every run,
   and in what order. Skill-inherited documents are not counted here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ContextAttachTab } from "@/components/context-docs";
import { useAgentContext, useSetAgentContext } from "@/lib/hooks/context";

export function AgentContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("context");
  const attachments = useAgentContext(agent.id);
  const setContext = useSetAgentContext(agent.id);

  if (attachments.isLoading) return <Skeleton height={44} />;
  if (attachments.isError) return <ErrorState title={t("attach.loadError")} onRetry={() => attachments.refetch()} />;

  return (
    <ContextAttachTab
      attachments={attachments.data ?? []}
      onSave={(paths) => setContext.mutateAsync(paths)}
      title={t("title")}
      note={t("attach.agentNote")}
      footer={({ tokens }) => t("tokens", { count: tokens })}
    />
  );
}
