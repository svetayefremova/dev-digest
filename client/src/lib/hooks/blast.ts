/* hooks/blast.ts — React Query hook for a PR's blast radius (GET /pulls/:id/blast). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadiusResponse } from "@devdigest/shared";

/** Changed symbols → who calls them → endpoints/crons that depend on them. */
export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-blast", prId],
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
