/* /skills — Skills library: the skill list on the left, and a prompt to pick
   one on the right. Selecting a card moves to /skills/:id. */
"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { AppShell } from "../../components/app-shell";
import { SkillsSidebar } from "./_components/SkillsSidebar";
import { s } from "./styles";

export default function SkillsPage() {
  const t = useTranslations("skills");
  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      <div style={s.split}>
        <SkillsSidebar />
        <div style={s.centered}>
          <EmptyState icon="Sparkles" title={t("page.select.title")} body={t("page.select.body")} />
        </div>
      </div>
    </AppShell>
  );
}
