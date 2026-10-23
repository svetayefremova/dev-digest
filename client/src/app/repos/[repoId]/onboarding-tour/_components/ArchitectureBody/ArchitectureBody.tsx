"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown, Skeleton } from "@devdigest/ui";
import type { OnboardingTour } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram/MermaidDiagram";
import { s } from "./styles";

/** Model text: no images (tracking beacons) and no links (phishing); link text stays. */
const MODEL_MD_DISALLOWED = ["img", "a"];

function Facts({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={s.facts}>
      <span style={s.factLabel}>{label}</span>
      {items.map((item) => (
        <span key={item} className="mono" style={s.chip}>
          {item}
        </span>
      ))}
    </div>
  );
}

export function ArchitectureBody({
  architecture,
  placeholder,
}: {
  architecture: OnboardingTour["architecture"];
  /** First generation still running: bars stand in for the AI summary. */
  placeholder: boolean;
}) {
  const t = useTranslations("onboarding");
  return (
    <div style={s.wrap}>
      <Facts label={t("stack")} items={architecture.stack} />
      <Facts label={t("directories")} items={architecture.topLevelDirs} />
      {placeholder ? (
        <div role="status" aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton height={14} />
          <Skeleton height={14} width="80%" />
        </div>
      ) : (
        <Markdown skipHtml disallowedElements={MODEL_MD_DISALLOWED} unwrapDisallowed>{architecture.summary}</Markdown>
      )}
      {architecture.diagram && <MermaidDiagram chart={architecture.diagram} />}
    </div>
  );
}
