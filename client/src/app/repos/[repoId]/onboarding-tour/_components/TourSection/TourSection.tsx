"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@devdigest/ui";
import { s } from "./styles";

export function TourSection({
  id,
  title,
  icon,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  icon: IconName;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("onboarding");
  const SectionIcon = Icon[icon];
  const Chevron = expanded ? Icon.ChevronDown : Icon.ChevronRight;
  const bodyId = `${id}-body`;
  return (
    <section id={id} style={s.card} aria-labelledby={`${id}-heading`}>
      <button
        type="button"
        style={s.head}
        aria-expanded={expanded}
        aria-controls={bodyId}
        aria-label={t("toggleSection", { section: title })}
        onClick={onToggle}
      >
        <span style={s.tile} aria-hidden>
          <SectionIcon size={14} />
        </span>
        <h2 id={`${id}-heading`} style={{ ...s.title, margin: 0, fontSize: 14, fontWeight: 600 }}>
          {title}
        </h2>
        <span style={s.chevron} aria-hidden>
          <Chevron size={16} />
        </span>
      </button>
      <div id={bodyId} style={s.body} hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}
