/* SkillForm — the controlled name / description / type / body fields shared by
   create, the import preview and the editor's Config tab. Owns no state and no
   submit button. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "./constants";

export interface SkillFormValues {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

/** A skill can be saved once it has a name and a body. */
export function isSkillFormValid(values: SkillFormValues): boolean {
  return values.name.trim().length > 0 && values.body.trim().length > 0;
}

export function SkillForm({
  values,
  onChange,
  bodyRows = 14,
  renderBody,
}: {
  values: SkillFormValues;
  onChange: (values: SkillFormValues) => void;
  bodyRows?: number;
  /** Replaces the plain body textarea (the Config tab passes its SkillBodyEditor). */
  renderBody?: (body: string, onBodyChange: (body: string) => void) => React.ReactNode;
}) {
  const t = useTranslations("skills");
  const set = <K extends keyof SkillFormValues>(key: K, value: SkillFormValues[K]) =>
    onChange({ ...values, [key]: value });
  const typeOptions = SKILL_TYPES.map((value) => ({ value, label: t(`type.${value}`) }));

  return (
    <>
      <FormField label={t("form.name")} required>
        <TextInput value={values.name} onChange={(v) => set("name", v)} placeholder={t("form.namePlaceholder")} mono />
      </FormField>
      <FormField label={t("form.description")} hint={t("form.descriptionHint")}>
        <Textarea
          value={values.description}
          onChange={(v) => set("description", v)}
          placeholder={t("form.descriptionPlaceholder")}
          rows={3}
        />
      </FormField>
      <FormField label={t("form.type")}>
        <SelectInput value={values.type} onChange={(v) => set("type", v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("form.body")} hint={t("form.bodyHint")} required>
        {renderBody ? (
          renderBody(values.body, (v) => set("body", v))
        ) : (
          <Textarea
            value={values.body}
            onChange={(v) => set("body", v)}
            placeholder={t("form.bodyPlaceholder")}
            rows={bodyRows}
            mono
          />
        )}
      </FormField>
    </>
  );
}
