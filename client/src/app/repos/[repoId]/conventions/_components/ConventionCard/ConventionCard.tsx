/* ConventionCard — one candidate house rule: the rule, the code it was found
   in, how confident the scan is, and Accept / Reject / Edit. Edit swaps the
   rule for an inline form on the card itself. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, IconBtn, ProgressBar, SelectInput, Textarea } from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory } from "@devdigest/shared";
import { CONVENTION_CATEGORIES, STRONG_CONFIDENCE_PCT } from "../../constants";
import { confidencePct, evidenceRef } from "../../helpers";
import { s } from "./styles";

export function ConventionCard({
  candidate,
  busy = false,
  onAccept,
  onReject,
  onSave,
}: {
  candidate: ConventionCandidate;
  /** A change to this candidate is being saved. */
  busy?: boolean;
  /** Toggle accepted ↔ pending. */
  onAccept: (accepted: boolean) => void;
  onReject: () => void;
  onSave: (edit: { rule: string; category: ConventionCategory }) => void;
}) {
  const t = useTranslations("conventions");
  const accepted = candidate.status === "accepted";
  const pct = confidencePct(candidate.confidence);
  const [draft, setDraft] = React.useState<{ rule: string; category: ConventionCategory } | null>(null);

  const save = () => {
    if (!draft) return;
    onSave({ rule: draft.rule.trim(), category: draft.category });
    setDraft(null);
  };

  return (
    <article style={s.card(accepted)} aria-label={candidate.rule}>
      <div style={s.main}>
        {draft ? (
          <>
            <div style={s.editFields}>
              <FormField label={t("card.ruleLabel")}>
                <Textarea value={draft.rule} onChange={(rule) => setDraft({ ...draft, rule })} rows={2} />
              </FormField>
              <FormField label={t("card.categoryLabel")}>
                <SelectInput
                  value={draft.category}
                  onChange={(category) => setDraft({ ...draft, category: category as ConventionCategory })}
                  options={CONVENTION_CATEGORIES.map((value) => ({ value, label: t(`category.${value}`) }))}
                />
              </FormField>
            </div>
            <div style={s.editActions}>
              <Button kind="primary" size="sm" icon="Check" onClick={save} disabled={draft.rule.trim() === ""}>
                {t("card.save")}
              </Button>
              <Button kind="ghost" size="sm" onClick={() => setDraft(null)}>
                {t("card.cancel")}
              </Button>
            </div>
          </>
        ) : (
          <div style={s.ruleRow}>
            <div style={s.rule}>{candidate.rule}</div>
            <Badge mono>{t(`category.${candidate.category}`)}</Badge>
          </div>
        )}

        <div style={s.evidence}>
          <div style={s.evidenceHead}>
            <span className="mono" style={s.evidencePath} title={evidenceRef(candidate)}>
              {evidenceRef(candidate)}
            </span>
            <IconBtn
              icon="Copy"
              label={t("card.copy")}
              size={26}
              onClick={() => void navigator.clipboard?.writeText(candidate.evidence_snippet)}
            />
          </div>
          <pre className="mono" style={s.snippet}>
            {candidate.evidence_snippet}
          </pre>
        </div>

        <div style={s.confidence}>
          <span>{t("card.confidence")}</span>
          <div style={s.bar}>
            <ProgressBar value={pct} color={pct >= STRONG_CONFIDENCE_PCT ? "var(--ok)" : "var(--warn)"} />
          </div>
          <span className="tnum">{pct}%</span>
        </div>
      </div>

      <div style={s.actions}>
        <Button
          kind={accepted ? "primary" : "secondary"}
          icon="Check"
          full
          aria-pressed={accepted}
          disabled={busy}
          onClick={() => onAccept(!accepted)}
        >
          {accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button kind="secondary" icon="X" full disabled={busy} onClick={onReject}>
          {t("card.reject")}
        </Button>
        <Button
          kind="ghost"
          icon="Edit"
          full
          disabled={busy || draft !== null}
          onClick={() => setDraft({ rule: candidate.rule, category: candidate.category })}
        >
          {t("card.edit")}
        </Button>
      </div>
    </article>
  );
}
