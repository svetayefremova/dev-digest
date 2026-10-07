import type { Metadata } from "next";
import { api } from "@/lib/api";
import type { Repo } from "@/lib/types";

/* Server-only metadata for every /repos/:repoId/* route — fetches the repo's
   full_name so the tab/history entry names the repo instead of just saying
   "DevDigest". No single-repo GET exists on the API, so this fetches the list
   and finds the match (metadata-only, not rendered). The PR-detail route has
   its own more specific layout that overrides this with the PR's title. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ repoId: string }>;
}): Promise<Metadata> {
  const { repoId } = await params;
  try {
    const repos = await api.get<Repo[]>("/repos");
    const repo = repos.find((r) => r.id === repoId);
    return repo ? { title: `${repo.full_name} — DevDigest` } : {};
  } catch {
    return {};
  }
}

export default function RepoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
