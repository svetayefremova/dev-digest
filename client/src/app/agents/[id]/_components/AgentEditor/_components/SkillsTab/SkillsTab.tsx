/* SkillsTab — which workspace skills this agent uses, and in what order. The
   list order is the order of the skill blocks in the assembled prompt. Every
   change saves the full ordered set. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { SkillTypeBadge } from "../../../../../../../components/skill-type-badge";
import { useAgentSkills, useSetAgentSkills, useSkills } from "../../../../../../../lib/hooks/skills";
import { buildRows, filterRows, moveRow, type SkillRow } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const tSkills = useTranslations("skills");
  const router = useRouter();
  const skills = useSkills();
  const links = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();
  const [search, setSearch] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);
  // Shown while a save is in flight so the list doesn't snap back; cleared once
  // the server answers (on failure the list reverts and the global toast fires).
  const [pending, setPending] = React.useState<SkillRow[] | null>(null);

  const saved = React.useMemo(() => buildRows(skills.data ?? [], links.data ?? []), [skills.data, links.data]);
  const rows = pending ?? saved;
  const visible = filterRows(rows, search);

  const save = (next: SkillRow[]) => {
    if (next === rows) return;
    setPending(next);
    setSkills.mutate(
      { agentId: agent.id, skills: next.map((row) => ({ skill_id: row.skill.id, enabled: row.enabled })) },
      { onSettled: () => setPending(null) },
    );
  };

  const toggle = (id: string, enabled: boolean) =>
    save(rows.map((row) => (row.skill.id === id ? { ...row, enabled } : row)));

  // Keyboard reordering on the drag handle: swap with the visible neighbour.
  const nudge = (id: string, delta: -1 | 1) => {
    const neighbour = visible[visible.findIndex((row) => row.skill.id === id) + delta];
    if (neighbour) save(moveRow(rows, id, neighbour.skill.id));
  };

  const endDrag = () => {
    setDragId(null);
    setOverId(null);
  };

  if (skills.isLoading || links.isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={44} />
      </div>
    );
  }
  if (skills.isError || links.isError) {
    return (
      <ErrorState
        body={t("skills.loadError")}
        onRetry={() => {
          void skills.refetch();
          void links.refetch();
        }}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="Sparkles"
        title={t("skills.emptyTitle")}
        body={t("skills.emptyBody")}
        cta={t("skills.emptyCta")}
        onCta={() => router.push("/skills")}
      />
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: rows.filter((row) => row.enabled).length, total: rows.length })}
        </Badge>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {visible.length === 0 && <div style={s.noMatch}>{t("skills.noMatch")}</div>}
      <ul style={s.list}>
        {visible.map(({ skill, enabled }) => (
          <li
            key={skill.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              setDragId(skill.id);
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setOverId(skill.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) save(moveRow(rows, dragId, skill.id));
              endDrag();
            }}
            onDragEnd={endDrag}
            style={s.row(enabled, dragId === skill.id, overId === skill.id && dragId !== skill.id)}
          >
            <button
              type="button"
              aria-label={t("skills.dragHandle", { name: skill.name })}
              title={t("skills.dragHandle", { name: skill.name })}
              onKeyDown={(e) => {
                if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                e.preventDefault();
                nudge(skill.id, e.key === "ArrowUp" ? -1 : 1);
              }}
              style={s.handle}
            >
              <Icon.Menu size={14} />
            </button>
            <Checkbox
              checked={enabled}
              onChange={(v) => toggle(skill.id, v)}
              label={<span style={s.srOnly}>{t("skills.toggle", { name: skill.name })}</span>}
            />
            <span className="mono" style={s.name(enabled)} title={skill.description || skill.name}>
              {skill.name}
            </span>
            <SkillTypeBadge type={skill.type} label={tSkills(`type.${skill.type}`)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
