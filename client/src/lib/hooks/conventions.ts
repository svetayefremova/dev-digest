/* hooks/conventions.ts — React Query hooks for the Conventions page: the last
   scan of a repo, per-candidate decisions, and the skill built from them. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionScan,
  ConventionSkillCreated,
  ConventionSkillDraft,
  ConventionStatus,
  SkillType,
} from "@devdigest/shared";

const scanKey = (repoId: string) => ["conventions", repoId];

export function useConventions(repoId: string) {
  return useQuery({
    queryKey: scanKey(repoId),
    queryFn: () => api.get<ConventionScan>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Scan the repo (first run and re-scan alike); resolves with the new list. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionScan>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (scan) => qc.setQueryData(scanKey(repoId), scan),
  });
}

export interface UpdateConventionInput {
  id: string;
  patch: { status?: ConventionStatus; rule?: string; category?: ConventionCategory };
}

/** Accept / reject / edit one candidate. A rejected one leaves the list for good. */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionInput) =>
      api.put<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (candidate) =>
      qc.setQueryData<ConventionScan>(scanKey(repoId), (scan) =>
        scan && {
          ...scan,
          candidates:
            candidate.status === "rejected"
              ? scan.candidates.filter((c) => c.id !== candidate.id)
              : scan.candidates.map((c) => (c.id === candidate.id ? candidate : c)),
        },
      ),
  });
}

/** Select all / deselect all. */
export function useSetAllConventionStatus(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: "pending" | "accepted") =>
      api.put<ConventionScan>(`/repos/${repoId}/conventions/status`, { status }),
    onSuccess: (scan) => qc.setQueryData(scanKey(repoId), scan),
  });
}

/** The skill the accepted candidates merge into. Always fetched fresh: it is
    only read while the create modal is open, right after the selection changed. */
export function useConventionSkillDraft(repoId: string) {
  return useQuery({
    queryKey: ["convention-skill-draft", repoId],
    queryFn: () => api.get<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`),
    staleTime: 0,
    gcTime: 0,
  });
}

export interface CreateConventionSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
  agent_ids: string[];
}

export function useCreateSkillFromConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConventionSkillInput) =>
      api.post<ConventionSkillCreated>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      // skill_count and the config version live on the agent.
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agent"] });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}
