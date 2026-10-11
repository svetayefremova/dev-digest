/* /agents/:id — Agent Editor (A2, L03). The same agent list on the left as
   /agents, the editor on the right. Tab state lives in ?tab=; picking another
   agent in the list keeps the tab that is open. */
"use client";

import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { AppShell } from "../../../components/app-shell";
import { AgentsSidebar } from "../_components/AgentsSidebar";
import { s } from "../styles";
import { AgentEditor, TAB_KEYS } from "./_components/AgentEditor";
import { useAgent } from "../../../lib/hooks/agents";
import { ApiError } from "../../../lib/api";

/* useSearchParams() opts this route out of static rendering unless wrapped in
   its own Suspense boundary (Next.js requirement) — see the default export below. */
function AgentEditorPageInner() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { id } = params;

  const { data: agent, isLoading, isError, error, refetch } = useAgent(id);

  const tab = TAB_KEYS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (t: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", t);
    router.replace(`/agents/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: "Skills Lab" },
    { label: "Agents", href: "/agents" },
    { label: agent?.name ?? "Agent" },
  ];

  return (
    <AppShell crumb={crumb}>
      <div style={s.split}>
        <AgentsSidebar activeId={id} tab={tab} />
        {isError || (!isLoading && !agent) ? (
          // The list stays usable so another agent can be picked.
          <div style={s.centered}>
            <ErrorState
              title="Couldn’t load this agent"
              body={error instanceof ApiError ? error.message : "The agent could not be loaded."}
              onRetry={() => refetch()}
            />
          </div>
        ) : isLoading || !agent ? (
          <div style={s.loading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={s.detail}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 }}>
              <Icon.Cpu size={18} style={{ color: "var(--accent)" }} />
              <h1 style={{ fontSize: 18, fontWeight: 700 }}>{agent.name}</h1>
              <Badge color="var(--text-secondary)" mono>
                {agent.provider}/{agent.model}
              </Badge>
              {!agent.enabled && <Badge color="var(--text-muted)">disabled</Badge>}
              <div style={{ marginLeft: "auto" }}>
                <Button kind="secondary" size="sm" icon="GitPullRequest" onClick={() => router.push("/")}>
                  Run on a PR…
                </Button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              <AgentEditor agent={agent} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function AgentEditorPage() {
  return (
    <Suspense fallback={null}>
      <AgentEditorPageInner />
    </Suspense>
  );
}
