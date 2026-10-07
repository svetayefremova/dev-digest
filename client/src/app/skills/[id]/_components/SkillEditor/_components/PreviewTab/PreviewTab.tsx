/* PreviewTab — the skill as the reviewing agent receives it: the block header
   that really goes into the prompt, then the body rendered as markdown. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { skillBlockHeader } from "./helpers";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <p style={s.lead}>{t("preview.lead")}</p>
      <pre className="mono" style={s.blockHeader}>
        {skillBlockHeader(skill)}
      </pre>
      <Card pad={false} style={s.card}>
        {/* The prompt carries the body trimmed, like formatSkillBlock. */}
        <Markdown>{skill.body.trim()}</Markdown>
      </Card>
    </div>
  );
}
