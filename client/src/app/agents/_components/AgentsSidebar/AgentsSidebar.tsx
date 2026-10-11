/* AgentsSidebar — the master column shared by /agents and /agents/:id: heading,
   "Add Agent" (from scratch / template), search and the list of AgentCards.
   Selecting a card opens that agent on the tab the editor already shows
   (`tab`). With no agents in the workspace only the heading is shown — the
   page's empty view carries the create actions. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { useAgents, useUpdateAgent } from "../../../../lib/hooks/agents";
import { AgentCard } from "../AgentCard";
import { CreateAgentModal } from "../CreateAgentModal";
import { TEMPLATES } from "./constants";
import { filterAgents } from "./helpers";
import { s } from "./styles";

export function AgentsSidebar({ activeId, tab }: { activeId?: string; tab?: string }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const { data: agents, isLoading, isError, refetch } = useAgents();
  const update = useUpdateAgent();
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const list = filterAgents(agents ?? [], search);
  const loaded = !isLoading && !isError;
  const isEmpty = loaded && (agents ?? []).length === 0;

  return (
    <div style={s.wrap}>
      {creating && <CreateAgentModal onClose={() => setCreating(false)} />}
      <div style={s.top}>
        <div style={s.titleRow}>
          <h1 style={s.h1}>{t("list.title")}</h1>
          {!isEmpty && (
            <Dropdown
              width={220}
              align="right"
              trigger={
                <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                  {t("list.addAgent")}
                </Button>
              }
              items={[
                { label: t("list.createFromScratch"), icon: "Edit", onClick: () => setCreating(true) },
                { divider: true },
                ...TEMPLATES.map((tp) => ({
                  label: tp,
                  icon: "Cpu" as const,
                  muted: true,
                  onClick: () => setCreating(true),
                })),
              ]}
            />
          )}
        </div>
        {!isEmpty && (
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("list.searchPlaceholder")}
              aria-label={t("list.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
        )}
      </div>
      <div style={s.list}>
        {isLoading && (
          <div style={s.skeletons}>
            <Skeleton height={104} />
            <Skeleton height={104} />
            <Skeleton height={104} />
          </div>
        )}
        {isError && <ErrorState body={t("list.loadError")} onRetry={() => refetch()} />}
        {loaded && !isEmpty && list.length === 0 && (
          <div style={s.note}>
            <div style={s.noteTitle}>{t("list.noMatch.title")}</div>
            <div style={s.noteBody}>{t("list.noMatch.body")}</div>
          </div>
        )}
        {list.map((a) => (
          <AgentCard
            key={a.id}
            ag={a}
            skillCount={a.skill_count}
            active={a.id === activeId}
            onClick={() => router.push(tab ? `/agents/${a.id}?tab=${tab}` : `/agents/${a.id}`)}
            onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
          />
        ))}
      </div>
    </div>
  );
}
