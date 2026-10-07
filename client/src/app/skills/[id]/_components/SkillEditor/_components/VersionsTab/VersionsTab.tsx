/* VersionsTab — the skill's body history. Every body change is a version; a
   restore appends a NEW version carrying the old body, so the versions that
   past runs recorded are never rewritten. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { formatVersionDate, sortVersions } from "./helpers";
import { s } from "./styles";
import { VersionDiffModal } from "./VersionDiffModal";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const versions = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffOf, setDiffOf] = React.useState<SkillVersion | null>(null);
  // The version being restored. The ref closes the gap before `isPending`
  // re-renders, so a double-click cannot append two versions.
  const [restoring, setRestoring] = React.useState<number | null>(null);
  const busy = React.useRef(false);

  const rows = React.useMemo(() => sortVersions(versions.data ?? []), [versions.data]);

  const onRestore = (version: number) => {
    if (busy.current || restore.isPending) return;
    busy.current = true;
    setRestoring(version);
    // Failures are surfaced by the global mutation error toast.
    restore.mutate(
      { id: skill.id, version },
      {
        onSuccess: (restored) => toast.success(t("versions.restored", { from: version, version: restored.version })),
        onSettled: () => {
          busy.current = false;
          setRestoring(null);
        },
      },
    );
  };

  if (versions.isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={44} />
      </div>
    );
  }
  if (versions.isError) {
    return <ErrorState body={t("versions.loadError")} onRetry={() => void versions.refetch()} />;
  }
  if (rows.length === 0) {
    return <EmptyState icon="History" title={t("versions.emptyTitle")} body={t("versions.emptyBody")} />;
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        <Badge color="var(--accent)" bg="var(--accent-bg)">
          {t("versions.count", { count: rows.length })}
        </Badge>
      </div>
      <p style={s.hint}>{t("versions.hint")}</p>

      <ul style={s.list}>
        {rows.map((v) => (
          <li key={v.version} style={s.row(v.current)}>
            <span className="mono tnum" style={s.version}>
              {t("versions.label", { version: v.version })}
            </span>
            <span style={{ ...s.message, ...(v.message ? null : s.noMessage) }} title={v.message || undefined}>
              {v.message || t("versions.noMessage")}
            </span>
            <span className="tnum" style={s.date}>
              {formatVersionDate(v.created_at)}
            </span>
            {v.current ? (
              <Badge color="var(--ok)" bg="var(--ok-bg)">
                {t("versions.current")}
              </Badge>
            ) : (
              <div style={s.actions}>
                <Button
                  size="sm"
                  kind="ghost"
                  aria-label={t("versions.diffAria", { version: v.version })}
                  onClick={() => setDiffOf(v)}
                >
                  {t("versions.diff")}
                </Button>
                <Button
                  size="sm"
                  kind="secondary"
                  icon="History"
                  aria-label={t("versions.restoreAria", { version: v.version })}
                  loading={restoring === v.version}
                  disabled={restoring !== null || restore.isPending}
                  onClick={() => onRestore(v.version)}
                >
                  {t("versions.restore")}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {diffOf && (
        <VersionDiffModal
          version={diffOf}
          currentVersion={skill.version}
          currentBody={skill.body}
          onClose={() => setDiffOf(null)}
        />
      )}
    </div>
  );
}
