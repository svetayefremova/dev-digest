/* hooks/context.ts — React Query hooks for Project Context: the repo's
   Markdown docs (read-only) and the docs attached to agents / skills. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ContextAttachment, ContextDocContent, ContextDocList } from "../types";

export function useContextDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context", repoId],
    queryFn: () => api.get<ContextDocList>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useContextDoc(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["context-doc", repoId, path],
    queryFn: () => api.get<ContextDocContent>(`/repos/${repoId}/context/file?path=${encodeURIComponent(path!)}`),
    enabled: !!repoId && !!path,
  });
}

export function useAgentContext(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-context", agentId],
    queryFn: () => api.get<ContextAttachment[]>(`/agents/${agentId}/context`),
    enabled: !!agentId,
  });
}

export function useSkillContext(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-context", skillId],
    queryFn: () => api.get<ContextAttachment[]>(`/skills/${skillId}/context`),
    enabled: !!skillId,
  });
}

/** Replace the agent's whole ordered attachment list. */
export function useSetAgentContext(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) => api.put<ContextAttachment[]>(`/agents/${agentId}/context`, { paths }),
    onSuccess: (attachments) => {
      qc.setQueryData(["agent-context", agentId], attachments);
      // "Used by n agents" lives on the doc list.
      qc.invalidateQueries({ queryKey: ["context"] });
    },
  });
}

/** Replace the skill's whole ordered attachment list. */
export function useSetSkillContext(skillId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) => api.put<ContextAttachment[]>(`/skills/${skillId}/context`, { paths }),
    onSuccess: (attachments) => {
      qc.setQueryData(["skill-context", skillId], attachments);
      qc.invalidateQueries({ queryKey: ["context"] });
    },
  });
}
