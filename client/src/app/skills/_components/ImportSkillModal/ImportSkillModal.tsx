/* ImportSkillModal — upload a .md / .zip, review what the server extracted,
   and only then save. Nothing is persisted until "Confirm import"; the skill is
   stored disabled. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ApiError } from "../../../../lib/api";
import { useCreateSkill, useImportPreview } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { SkillForm, isSkillFormValid, type SkillFormValues } from "../SkillForm";
import { ACCEPTED_FILES, MAX_IMPORT_BYTES } from "./constants";
import { fileToBase64 } from "./helpers";
import { s } from "./styles";

export function ImportSkillModal({ onClose, onImported }: { onClose: () => void; onImported?: (skill: Skill) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const preview = useImportPreview();
  const create = useCreateSkill();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // The extracted skill, editable before it is saved. null = no preview yet.
  const [values, setValues] = React.useState<SkillFormValues | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setValues(null);
    setError(null);
    if (file.size > MAX_IMPORT_BYTES) {
      setError(t("import.tooLarge"));
      return;
    }
    try {
      const result = await preview.mutateAsync({ filename: file.name, content_base64: await fileToBase64(file) });
      setValues({ name: result.name, description: result.description, type: result.type, body: result.body });
    } catch (e) {
      // Shown inline next to the picker (the global toast fires as well).
      setError(e instanceof ApiError ? e.message : t("import.failed"));
    }
  };

  const confirm = () => {
    if (!values) return;
    create.mutate(
      { ...values, source: "imported_file", source_file: fileName ?? undefined },
      {
        onSuccess: (skill) => {
          toast.success(t("import.imported", { name: skill.name }));
          onImported?.(skill);
          onClose();
        },
      },
    );
  };

  const skipped = preview.data?.skipped_files ?? [];

  return (
    <Modal
      width={720}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Check"
            onClick={confirm}
            disabled={!values || !isSkillFormValid(values) || create.isPending}
          >
            {create.isPending ? t("import.confirming") : t("import.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.picker}>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_FILES}
            aria-label={t("import.choose")}
            hidden
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = ""; // allow re-picking the same file
            }}
          />
          <Button kind="secondary" icon="Upload" onClick={() => fileInput.current?.click()} disabled={preview.isPending}>
            {fileName ? t("import.chooseAnother") : t("import.choose")}
          </Button>
          <span style={s.pickerText}>
            {preview.isPending ? t("import.reading") : (fileName ?? t("import.accepted"))}
          </span>
        </div>

        {error && (
          <div role="alert" style={s.error}>
            {error}
          </div>
        )}

        {values && preview.data && (
          <>
            <div style={s.heading}>{t("import.previewHeading")}</div>
            <div style={s.source}>{t("import.sourceFile", { file: preview.data.source_file })}</div>
            <div style={s.callout("warn")}>
              <div style={s.calloutTitle}>{t("import.trustTitle")}</div>
              {t("import.trustBody")}
            </div>
            {skipped.length > 0 && (
              <div style={s.callout("muted")}>
                <div style={s.calloutTitle}>{t("import.skippedTitle", { count: skipped.length })}</div>
                {t("import.skippedBody")}
                <ul className="mono" style={s.skippedList}>
                  {skipped.map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
              </div>
            )}
            <SkillForm values={values} onChange={setValues} bodyRows={12} />
          </>
        )}
      </div>
    </Modal>
  );
}
