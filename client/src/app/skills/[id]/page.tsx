/* /skills/:id — Skill editor. The same skill list on the left, the editor
   (Config · Preview · Stats · Versions) on the right. Tab state lives in ?tab=;
   with no ?tab the skill opens on Config. Picking another skill in the list
   keeps the tab that is open. */
"use client";

import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../components/app-shell";
import { ApiError } from "../../../lib/api";
import { useSkill } from "../../../lib/hooks/skills";
import { SkillsSidebar } from "../_components/SkillsSidebar";
import { s } from "../styles";
import { SkillEditor, DEFAULT_TAB, TAB_KEYS } from "./_components/SkillEditor";

/* useSearchParams() opts this route out of static rendering unless wrapped in
   its own Suspense boundary (Next.js requirement) — see the default export below. */
function SkillEditorPageInner() {
  const t = useTranslations("skills");
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);

  const requested = search.get("tab") ?? "";
  const tab = TAB_KEYS.includes(requested) ? requested : DEFAULT_TAB;
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("editor.crumbFallback") },
  ];

  return (
    <AppShell crumb={crumb}>
      <div style={s.split}>
        <SkillsSidebar activeId={id} tab={tab} />
        {isError || (!isLoading && !skill) ? (
          // The list stays usable so another skill can be picked.
          <div style={s.centered}>
            <ErrorState
              title={t("editor.loadErrorTitle")}
              body={error instanceof ApiError ? error.message : t("editor.loadErrorBody")}
              onRetry={() => refetch()}
            />
          </div>
        ) : isLoading || !skill ? (
          <div style={s.loading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={s.detail}>
            {/* key: local form state must not leak from one skill to the next. */}
            <SkillEditor key={skill.id} skill={skill} tab={tab} onTab={setTab} />
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function SkillEditorPage() {
  return (
    <Suspense fallback={null}>
      <SkillEditorPageInner />
    </Suspense>
  );
}
