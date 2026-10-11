/* SkillEditor — skill editor shell: header (icon, name, type, version) and the
   Config / Preview / Versions / Stats tabs. Tab state lives in ?tab= and is
   owned by the route. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge, SKILL_TYPE_COLORS } from "../../../../../components/skill-type-badge";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillEditor({ skill, tab, onTab }: { skill: Skill; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Icon.Sparkles size={18} style={s.icon(SKILL_TYPE_COLORS[skill.type].color)} />
        <h1 className="mono" style={s.name} title={skill.name}>
          {skill.name}
        </h1>
        <SkillTypeBadge type={skill.type} label={t(`type.${skill.type}`)} />
        <Badge mono>{t("editor.version", { version: skill.version })}</Badge>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "config" && <ConfigTab skill={skill} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
        {tab === "stats" && <StatsTab skill={skill} />}
      </div>
    </div>
  );
}
