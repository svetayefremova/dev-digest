/* ConfigTab — edit a skill: name / description / type / body, with an optional
   "What changed" note that labels the new version. Only a body change creates a
   version. The Enabled switch applies at once (like the one on the card); the
   rest waits for "Save skill". */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, TextInput } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { SkillForm, isSkillFormValid, type SkillFormValues } from "../../../../../_components/SkillForm";
import { SkillBodyEditor } from "../../../../../../../components/skill-body-editor";
import { MAX_MESSAGE_LENGTH } from "./constants";
import { s } from "./styles";

const toFormValues = (skill: Skill): SkillFormValues => ({
  name: skill.name,
  description: skill.description,
  type: skill.type,
  body: skill.body,
});

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [values, setValues] = React.useState<SkillFormValues>(() => toFormValues(skill));
  const [message, setMessage] = React.useState("");

  const bodyChanged = values.body !== skill.body;
  const unsaved =
    bodyChanged ||
    values.name !== skill.name ||
    values.description !== skill.description ||
    values.type !== skill.type;

  const reset = () => {
    setValues(toFormValues(skill));
    setMessage("");
  };

  // Failures are surfaced by the global mutation error toast.
  const save = () => {
    const note = message.trim();
    update.mutate(
      // The note labels a version, and only a body change makes one.
      { id: skill.id, patch: { ...values, ...(bodyChanged && note ? { message: note } : {}) } },
      {
        onSuccess: (saved) => {
          toast.success(t("config.savedToast", { version: saved.version }));
          // The server may normalise what it stores; show exactly that.
          setValues(toFormValues(saved));
          setMessage("");
        },
      },
    );
  };

  const remove = () => {
    if (!window.confirm(t("config.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("config.deleted", { name: skill.name }));
        router.push("/skills");
      },
    });
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <Badge mono>{t("editor.version", { version: skill.version })}</Badge>
      </div>

      <SkillForm
        values={values}
        onChange={setValues}
        renderBody={(body, onBodyChange) => (
          <SkillBodyEditor
            fileName={t("bodyEditor.fileName", { name: values.name.trim() || t("bodyEditor.untitled") })}
            value={body}
            onChange={onBodyChange}
            savedBody={skill.body}
            savedTokens={skill.body_tokens}
            unsaved={unsaved}
            placeholder={t("form.bodyPlaceholder")}
          />
        )}
      />

      <div style={s.actions}>
        <Button
          kind="primary"
          icon="Check"
          onClick={save}
          disabled={!unsaved || update.isPending || !isSkillFormValid(values)}
        >
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        <Button kind="ghost" onClick={reset} disabled={(!unsaved && message === "") || update.isPending}>
          {t("form.cancel")}
        </Button>
        <div style={s.message}>
          <TextInput
            value={message}
            onChange={setMessage}
            placeholder={t("config.messagePlaceholder")}
            aria-label={t("config.message")}
            maxLength={MAX_MESSAGE_LENGTH}
          />
        </div>
      </div>
      <div style={s.messageHint}>{t("config.messageHint")}</div>

      <div style={s.danger}>
        <div style={s.dangerText}>{t("config.deleteHint")}</div>
        <Button kind="danger" icon="Trash" onClick={remove} disabled={del.isPending}>
          {t("config.delete")}
        </Button>
      </div>
    </div>
  );
}
