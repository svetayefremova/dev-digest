/* hooks/context.ts — React Query hooks for the Project Context Folder
   (A3 contract; safe to call once API exposes it). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { SpecFile, IndexStatus } from "../types";

export function useContextFiles(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context", repoId],
    queryFn: () => api.get<SpecFile[]>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useReindexContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<IndexStatus>(`/repos/${repoId}/context/reindex`),
    onSuccess: (_d, repoId) => qc.invalidateQueries({ queryKey: ["context", repoId] }),
  });
}
