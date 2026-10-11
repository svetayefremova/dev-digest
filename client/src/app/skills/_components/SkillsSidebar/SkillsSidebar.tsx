/* SkillsSidebar — the master column shared by /skills and /skills/:id: heading,
   "Add Skill" (create / import), search and the list of SkillCards. Selecting a
   card opens that skill on the tab the editor already shows (`tab`), or on the
   default tab when no skill is open yet. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { SkillFormModal } from "../SkillFormModal";
import { ImportSkillModal } from "../ImportSkillModal";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsSidebar({ activeId, tab }: { activeId?: string; tab?: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const update = useUpdateSkill();
  // The switch being saved: shown at its requested value until the list
  // refetches, so it doesn't snap back (a failure reverts it and toasts).
  const toggling = update.isPending && update.variables.patch.enabled !== undefined ? update.variables : null;

  const list = filterSkills(skills ?? [], search);
  const loaded = !isLoading && !isError;
  const isEmpty = loaded && (skills ?? []).length === 0;

  return (
    <div style={s.wrap}>
      {creating && (
        <SkillFormModal
          onClose={() => setCreating(false)}
          // A new skill usually needs more editing — land on Config.
          onCreated={(sk) => router.push(`/skills/${sk.id}?tab=config`)}
        />
      )}
      {importing && (
        <ImportSkillModal
          onClose={() => setImporting(false)}
          // An imported skill is someone else's text — land on Preview to read it.
          onImported={(sk) => router.push(`/skills/${sk.id}?tab=preview`)}
        />
      )}
      <div style={s.top}>
        <div style={s.titleRow}>
          <h1 style={s.h1}>{t("page.heading")}</h1>
          <Dropdown
            width={210}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.create"), icon: "Edit", onClick: () => setCreating(true) },
              { label: t("page.menu.import"), icon: "Upload", onClick: () => setImporting(true) },
            ]}
          />
        </div>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("page.searchPlaceholder")}
            aria-label={t("page.searchPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>
      <div style={s.list}>
        {isLoading && (
          <div style={s.skeletons}>
            <Skeleton height={104} />
            <Skeleton height={104} />
            <Skeleton height={104} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {isEmpty && (
          <div style={s.note}>
            <div style={s.noteTitle}>{t("page.empty.title")}</div>
            <div style={s.noteBody}>{t("page.empty.body")}</div>
          </div>
        )}
        {loaded && !isEmpty && list.length === 0 && (
          <div style={s.note}>
            <div style={s.noteTitle}>{t("page.noMatch.title")}</div>
            <div style={s.noteBody}>{t("page.noMatch.body")}</div>
          </div>
        )}
        {list.map((sk) => (
          <SkillCard
            key={sk.id}
            skill={toggling?.id === sk.id ? { ...sk, enabled: !!toggling.patch.enabled } : sk}
            active={sk.id === activeId}
            onClick={() => router.push(tab ? `/skills/${sk.id}?tab=${tab}` : `/skills/${sk.id}`)}
            onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
          />
        ))}
      </div>
    </div>
  );
}
