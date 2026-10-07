import type { Metadata } from "next";
import { api } from "@/lib/api";
import type { Skill } from "@devdigest/shared";

/* Server-only metadata for /skills/:id — fetches just the skill's name so the
   browser tab/history entry names the open skill instead of "DevDigest". The
   page itself stays a client component; this layout adds nothing to the render
   tree beyond generateMetadata. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const skill = await api.get<Skill>(`/skills/${id}`);
    return { title: `${skill.name} — DevDigest` };
  } catch {
    return {};
  }
}

export default function SkillLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
