/* /agents — Agents: the agent list on the left, and a prompt to pick one on
   the right. Selecting a card moves to /agents/:id. With no agents, the right
   side explains what an agent is and offers to create the first. */
"use client";

import { useTranslations } from "next-intl";
import { EmptyState, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../components/app-shell";
import { useAgents } from "../../lib/hooks/agents";
import { AgentsSidebar } from "./_components/AgentsSidebar";
import { AgentsEmptyView } from "./_components/AgentsEmptyView";
import { s } from "./styles";

export default function AgentsPage() {
  const t = useTranslations("agents");
  const { data: agents, isLoading, isError } = useAgents();
  const isEmpty = !isLoading && !isError && (agents ?? []).length === 0;

  return (
    <AppShell crumb={[{ label: t("list.breadcrumbLab") }, { label: t("list.breadcrumb") }]}>
      <div style={s.split}>
        <AgentsSidebar />
        {isEmpty ? (
          <div style={s.centered}>
            <AgentsEmptyView />
          </div>
        ) : isLoading ? (
          <div style={s.loading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : isError ? (
          // The sidebar carries the load error and its retry.
          <div style={s.centered} />
        ) : (
          <div style={s.centered}>
            <EmptyState icon="Cpu" title={t("list.select.title")} body={t("list.select.body")} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
