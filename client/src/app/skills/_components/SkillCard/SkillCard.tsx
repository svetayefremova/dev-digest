/* SkillCard — one row of the Skills sidebar: icon in the type's colour, name,
   description, type + source, and a usage footer. Clicking the card opens the
   skill. The switch turns the skill off for the whole workspace: an off skill
   is left out of every run, whatever an agent's own Skills tab selects. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge, SKILL_TYPE_COLORS } from "../../../../components/skill-type-badge";
import { SOURCE_ICONS } from "./constants";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const SourceIcon = Icon[SOURCE_ICONS[skill.source]];
  const { usage } = skill;
  // A metric with no run data behind it is left out, not shown as 0%.
  const footer = usage
    ? [
        t("card.agents", { count: usage.agents }),
        usage.pull_pct != null ? t("card.pull", { pct: usage.pull_pct }) : null,
        usage.accept_pct != null ? t("card.accept", { pct: usage.accept_pct }) : null,
      ].filter((part): part is string => part !== null)
    : [];

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox(SKILL_TYPE_COLORS[skill.type])}>
          <Icon.Sparkles size={15} />
        </div>
        <button type="button" className="mono" style={s.name} title={skill.name}>
          {skill.name}
        </button>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()} title={t(skill.enabled ? "card.turnOff" : "card.turnOn")}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
      </div>
      <div style={s.description}>{skill.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <SkillTypeBadge type={skill.type} label={t(`type.${skill.type}`)} />
        <span style={s.source}>
          <SourceIcon size={12} />
          {t(`card.source.${skill.source}`)}
        </span>
      </div>
      {footer.length > 0 && (
        <div className="tnum" style={s.footer}>
          {footer.join(" · ")}
        </div>
      )}
    </div>
  );
}
