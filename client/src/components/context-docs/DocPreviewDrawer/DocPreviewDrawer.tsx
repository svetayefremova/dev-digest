/* DocPreviewDrawer — read-only preview of one repo document, with an optional
   Attached toggle (used from the agent / skill Context tabs). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer, ErrorState, Skeleton, Toggle } from "@devdigest/ui";
import type { ContextDoc } from "@devdigest/shared";
import { useContextDoc } from "@/lib/hooks/context";
import { DocCategoryBadge } from "../DocCategoryBadge";
import { DocMarkdown } from "../DocMarkdown";
import { s } from "./styles";

export interface DocPreviewDrawerProps {
  repoId: string;
  doc: ContextDoc;
  /** Present only where attaching makes sense (agent / skill tabs). */
  attached?: boolean;
  onToggle?: (attached: boolean) => void;
  onClose: () => void;
}

export function DocPreviewDrawer({ repoId, doc, attached, onToggle, onClose }: DocPreviewDrawerProps) {
  const t = useTranslations("context");
  const content = useContextDoc(repoId, doc.path);
  const body = content.data;

  return (
    <Drawer
      title={<span className="mono">{doc.path}</span>}
      subtitle={
        <span style={s.meta}>
          <DocCategoryBadge category={doc.category} />
          <span>{t("usedBy", { count: doc.used_by_agents })}</span>
          {doc.tokens != null && <span>{t("tokens", { count: doc.tokens })}</span>}
        </span>
      }
      onClose={onClose}
      footer={
        onToggle && (
          <div style={s.toggleRow}>
            <Toggle on={!!attached} onChange={onToggle} />
            <span>{t("attach.attachedToggle")}</span>
          </div>
        )
      }
    >
      {content.isLoading ? (
        <Skeleton height={120} />
      ) : content.isError ? (
        <ErrorState title={t("loadError")} onRetry={() => content.refetch()} />
      ) : body?.content == null ? (
        <p style={s.unreadable}>{t("unreadable")}</p>
      ) : (
        <DocMarkdown>{body.content}</DocMarkdown>
      )}
    </Drawer>
  );
}
