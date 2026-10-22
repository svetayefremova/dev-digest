/* DocPreviewPane — read-only rendered preview of the selected document. */
"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { ContextDoc } from "@devdigest/shared";
import { DocCategoryBadge, DocMarkdown } from "@/components/context-docs";
import { useContextDoc } from "@/lib/hooks/context";
import { s } from "./styles";

export function DocPreviewPane({ repoId, doc }: { repoId: string; doc: ContextDoc | null }) {
  const t = useTranslations("context");
  const format = useFormatter();
  const content = useContextDoc(repoId, doc?.path);

  if (!doc) {
    return (
      <div style={s.pane}>
        <p style={s.muted}>{t("selectPrompt")}</p>
      </div>
    );
  }

  const updated = new Date(doc.updated_at);
  return (
    <div style={s.pane}>
      <div style={s.header}>
        <div className="mono" style={s.path}>
          {doc.path}
        </div>
        <div style={s.segmented} role="tablist" aria-label={t("viewMode")}>
          <span role="tab" aria-selected="true" style={s.segment}>
            {t("attach.preview")}
          </span>
        </div>
        <div style={s.meta}>
          <DocCategoryBadge category={doc.category} />
          {doc.tokens != null && <span>{t("tokens", { count: doc.tokens })}</span>}
          <span title={updated.toLocaleString()}>{format.relativeTime(updated)}</span>
        </div>
        <span style={s.usedBy}>
          <Icon.Cpu size={14} />
          {t("usedBy", { count: doc.used_by_agents })}
        </span>
      </div>
      {!doc.previewable ? (
        <p style={s.muted}>{t("unreadable")}</p>
      ) : content.isLoading ? (
        <div style={s.body}>
          <Skeleton height={160} />
        </div>
      ) : content.isError ? (
        <div style={s.body}>
          <ErrorState title={t("loadError")} onRetry={() => content.refetch()} />
        </div>
      ) : content.data?.content == null ? (
        <p style={s.muted}>{t("unreadable")}</p>
      ) : (
        <div style={s.body}>
          <DocMarkdown>{content.data.content}</DocMarkdown>
        </div>
      )}
    </div>
  );
}
