/* CreateSkillFromConventionsModal — the accepted conventions merged into one
   skill. The server builds the draft; everything in it (name, description,
   type, body) stays editable here, and the skill is attached to the agents the
   user picks. Nothing is saved until "Create skill". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Checkbox,
  ErrorState,
  FormField,
  Icon,
  Modal,
  SelectInput,
  Skeleton,
  TextInput,
  Toggle,
} from "@devdigest/ui";
import type { ConventionSkillCreated, ConventionSkillDraft, SkillType } from "@devdigest/shared";
import { SkillBodyEditor } from "@/components/skill-body-editor";
import { SKILL_TYPE_COLORS } from "@/components/skill-type-badge";
import { useAgents } from "@/lib/hooks/agents";
import { useConventionSkillDraft, useCreateSkillFromConventions } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

const SKILL_TYPES = Object.keys(SKILL_TYPE_COLORS) as SkillType[];

interface Props {
  repoId: string;
  repoName: string;
  onClose: () => void;
  onCreated?: (created: ConventionSkillCreated) => void;
}

export function CreateSkillFromConventionsModal(props: Props) {
  const t = useTranslations("conventions");
  const draft = useConventionSkillDraft(props.repoId);

  // The form's initial values ARE the draft, so it only mounts once that exists.
  if (draft.data) return <DraftForm {...props} draft={draft.data} />;
  return (
    <Modal width={800} title={t("modal.title")} onClose={props.onClose}>
      {draft.isError ? (
        <ErrorState title={t("modal.loadError")} onRetry={() => draft.refetch()} />
      ) : (
        <div style={s.loading}>
          <Skeleton height={40} />
          <Skeleton height={40} />
          <Skeleton height={180} />
        </div>
      )}
    </Modal>
  );
}

function DraftForm({ repoId, repoName, onClose, onCreated, draft }: Props & { draft: ConventionSkillDraft }) {
  const t = useTranslations("conventions");
  const tSkills = useTranslations("skills");
  const toast = useToast();
  const { data: agents } = useAgents();
  const create = useCreateSkillFromConventions(repoId);

  const [name, setName] = React.useState(draft.name);
  const [description, setDescription] = React.useState(draft.description);
  const [type, setType] = React.useState<SkillType>(draft.type);
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState(draft.body);
  const [agentIds, setAgentIds] = React.useState<string[]>([]);

  const toggleAgent = (id: string, on: boolean) =>
    setAgentIds((ids) => (on ? [...ids, id] : ids.filter((x) => x !== id)));
  const valid = name.trim() !== "" && body.trim() !== "" && agentIds.length > 0;

  // Failures are surfaced by the global mutation error toast.
  const submit = () =>
    create.mutate(
      { name: name.trim(), description: description.trim(), type, enabled, body, agent_ids: agentIds },
      {
        onSuccess: (created) => {
          toast.success(t("modal.created", { name: created.name, count: created.agent_ids.length }));
          onCreated?.(created);
          onClose();
        },
      },
    );

  return (
    <Modal
      width={800}
      title={t("modal.title")}
      subtitle={<span className="mono">{name.trim() || draft.name}</span>}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.savedAs}>
            <Icon.GitCommit size={13} />
            {t("modal.savedAs")}
          </span>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={!valid || create.isPending}>
            {create.isPending ? t("modal.submitting") : t("modal.submit")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>
          <Icon.GitMerge size={15} style={s.bannerIcon} />
          <span>
            {t.rich("modal.banner", {
              count: draft.conventions,
              repo: repoName,
              b: (chunks) => <span style={s.bannerStrong}>{chunks}</span>,
              mono: (chunks) => (
                <span className="mono" style={s.bannerRepo}>
                  {chunks}
                </span>
              ),
            })}
          </span>
        </div>

        <FormField label={t("modal.name")} required>
          <TextInput value={name} onChange={setName} mono />
        </FormField>
        <FormField label={t("modal.description")}>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <div style={s.row}>
          <FormField label={t("modal.type")}>
            <SelectInput
              value={type}
              onChange={(v) => setType(v as SkillType)}
              options={SKILL_TYPES.map((value) => ({ value, label: tSkills(`type.${value}`) }))}
              mono
            />
          </FormField>
          <FormField label={t("modal.enabled")} hint={t("modal.enabledHint")}>
            <Toggle on={enabled} onChange={setEnabled} />
          </FormField>
        </div>
        <FormField label={t("modal.agents")} hint={t("modal.agentsHint")} required>
          {agents && agents.length === 0 ? (
            <div style={s.noAgents}>{t("modal.noAgents")}</div>
          ) : (
            <div style={s.agents}>
              {(agents ?? []).map((agent) => (
                <Checkbox
                  key={agent.id}
                  checked={agentIds.includes(agent.id)}
                  onChange={(on) => toggleAgent(agent.id, on)}
                  label={agent.name}
                />
              ))}
            </div>
          )}
        </FormField>
        <FormField label={t("modal.body")} required>
          <SkillBodyEditor
            fileName={tSkills("bodyEditor.fileName", { name: name.trim() || tSkills("bodyEditor.untitled") })}
            value={body}
            onChange={setBody}
            savedBody={draft.body}
            savedTokens={draft.body_tokens}
            unsaved
          />
        </FormField>
      </div>
    </Modal>
  );
}
