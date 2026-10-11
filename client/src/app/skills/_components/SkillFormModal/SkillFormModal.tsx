"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useCreateSkill } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { DEFAULT_SKILL_TYPE, SkillForm, isSkillFormValid, type SkillFormValues } from "../SkillForm";

const EMPTY: SkillFormValues = { name: "", description: "", type: DEFAULT_SKILL_TYPE, body: "" };

/** Create-skill modal — the shared SkillForm plus create/cancel. */
export function SkillFormModal({ onClose, onCreated }: { onClose: () => void; onCreated?: (skill: Skill) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const [values, setValues] = React.useState<SkillFormValues>(EMPTY);

  // Failures are surfaced by the global mutation error toast.
  const submit = () =>
    create.mutate(
      { ...values, source: "manual" },
      {
        onSuccess: (skill) => {
          toast.success(t("create.created", { name: skill.name }));
          onCreated?.(skill);
          onClose();
        },
      },
    );

  return (
    <Modal
      width={680}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button kind="ghost" onClick={onClose}>
            {t("form.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={create.isPending || !isSkillFormValid(values)}>
            {create.isPending ? t("create.submitting") : t("create.submit")}
          </Button>
        </div>
      }
    >
      <div style={{ padding: 24 }}>
        <SkillForm values={values} onChange={setValues} bodyRows={10} />
      </div>
    </Modal>
  );
}
