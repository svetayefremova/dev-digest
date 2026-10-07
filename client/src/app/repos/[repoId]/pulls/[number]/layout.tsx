import type { Metadata } from "next";
import { api } from "@/lib/api";
import type { PrMeta } from "@/lib/types";

/* Server-only metadata for /repos/:repoId/pulls/:number — overrides the
   repo-level layout's title with "#<number> <pr title>" so each open PR tab
   is distinguishable.
   [number] is the GitHub PR NUMBER, not the row's uuid (every /pulls/:id API
   is keyed by uuid — see page.tsx's own number→uuid resolution), so this
   fetches the repo's PR list and matches by number, same as the client does. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ repoId: string; number: string }>;
}): Promise<Metadata> {
  const { repoId, number } = await params;
  try {
    const pulls = await api.get<PrMeta[]>(`/repos/${repoId}/pulls`);
    const pr = pulls.find((p) => p.number === Number(number));
    return pr ? { title: `#${pr.number} ${pr.title} — DevDigest` } : {};
  } catch {
    return {};
  }
}

export default function PrDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
