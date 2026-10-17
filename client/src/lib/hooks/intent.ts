/* hooks/intent.ts — React Query hooks for the PR intent layer.
   Read the persisted intent, and explicitly (re-)detect it. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { PrIntentRecord } from "@devdigest/shared";

/** The PR's intent, or `null` when none has been detected yet (404). */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-intent", prId],
    queryFn: async () => {
      try {
        return await api.get<PrIntentRecord>(`/pulls/${prId}/intent`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    enabled: !!prId,
  });
}

/** Detect (or re-detect) the intent now; refreshes the card and the run history. */
export function useRedetectIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentRecord>(`/pulls/${prId}/intent`),
    onSuccess: (rec) => {
      qc.setQueryData(["pr-intent", prId], rec);
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
    },
  });
}
