/* hooks/onboarding.ts — React Query hooks for the Onboarding Tour.
     GET  /repos/:id/onboarding           → OnboardingTourState
     POST /repos/:id/onboarding/generate  → 202 (started) | 200 (already running) */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GenerateOnboardingResponse, OnboardingTourState } from "@devdigest/shared";
import { api } from "../api";

const POLL_MS = 5000;

export function useOnboardingTour(
  repoId: string | null | undefined,
  { poll = false }: { poll?: boolean | ((data: OnboardingTourState | undefined) => boolean) } = {},
) {
  return useQuery({
    queryKey: ["onboarding-tour", repoId],
    queryFn: () => api.get<OnboardingTourState>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    refetchInterval: (query) =>
      (typeof poll === "function" ? poll(query.state.data) : poll) ? POLL_MS : false,
  });
}

/** Errors surface as `ApiError` (status, code, details) for the caller to map. */
export function useGenerateOnboardingTour(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<GenerateOnboardingResponse>(`/repos/${repoId}/onboarding/generate`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-tour", repoId] });
    },
  });
}
