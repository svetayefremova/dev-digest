import type { Metadata } from "next";
import { api } from "@/lib/api";
import type { Agent } from "@devdigest/shared";

/* Server-only metadata for /agents/:id — fetches just the agent's name so the
   browser tab/history entry says something more useful than "DevDigest" for
   every open agent. The page itself stays a client component; this layout
   adds nothing to the render tree beyond generateMetadata. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const agent = await api.get<Agent>(`/agents/${id}`);
    return { title: `${agent.name} — DevDigest` };
  } catch {
    return {};
  }
}

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
