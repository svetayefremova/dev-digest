/* ContextAttachTab — shared body of the agent and skill Context tabs: lists
   the active repo's Markdown docs, attached ones first in their saved order.
   Every change saves the full ordered path list through `onSave`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { ContextAttachment } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/repo-context";
import { useContextDocs } from "@/lib/hooks/context";
import { DocCategoryBadge } from "../DocCategoryBadge";
import { DocPreviewDrawer } from "../DocPreviewDrawer";
import { attachedPaths, attachedTokens, buildAttachRows, filterDocs, moveRow, type AttachRow } from "../helpers";
import { s } from "./styles";

const baseName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);
const dirName = (path: string): string => (path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "");

export interface ContextAttachTabProps {
  attachments: ContextAttachment[];
  /** Persist the full ordered path list; reject on failure so the tab can roll back. */
  onSave: (paths: string[]) => Promise<unknown>;
  /** Heading of the tab. */
  title: string;
  /** Explanatory text under the header. */
  note: React.ReactNode;
  /** Rendered under the list with the current attached paths and their token sum. */
  footer?: (info: { paths: string[]; tokens: number }) => React.ReactNode;
}

export function ContextAttachTab({ attachments, onSave, title, note, footer }: ContextAttachTabProps) {
  const t = useTranslations("context");
  const { activeRepo } = useActiveRepo();
  const repoId = activeRepo?.id ?? null;
  const docs = useContextDocs(repoId);
  const [search, setSearch] = React.useState("");
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [overPath, setOverPath] = React.useState<string | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  // Shown while a save is in flight so the list doesn't snap back; cleared once
  // the server answers (on failure the list reverts and an error is shown).
  const [pending, setPending] = React.useState<AttachRow[] | null>(null);

  const saved = React.useMemo(
    () => buildAttachRows(docs.data?.docs ?? [], attachments),
    [docs.data, attachments],
  );
  const rows = pending ?? saved;
  const filtering = search.trim() !== "";
  const visible = filterDocs(rows, search);

  const save = (next: AttachRow[]) => {
    if (next === rows) return;
    setFailed(false);
    setPending(next);
    onSave(attachedPaths(next))
      .catch(() => setFailed(true))
      .finally(() => setPending(null));
  };

  // Attaching appends to the end of the attached block; detaching drops the row to the unattached part.
  const setAttached = (path: string, on: boolean) => {
    const rest = rows.filter((row) => row.path !== path);
    const target = rows.find((row) => row.path === path);
    if (!target) return;
    const attached = rest.filter((row) => row.attached);
    const others = rest.filter((row) => !row.attached);
    const updated: AttachRow = { ...target, attached: on };
    if (on) save([...attached, updated, ...others]);
    else if (updated.missing) save([...attached, ...others]);
    else save([...attached, ...[...others, updated].sort((a, b) => a.path.localeCompare(b.path))]);
  };

  const reorder = (fromPath: string, toPath: string) => {
    const next = moveRow(rows, fromPath, toPath);
    if (next === rows) return;
    const paths = attachedPaths(next);
    setAnnouncement(t("attach.moved", { path: fromPath, position: paths.indexOf(fromPath) + 1, total: paths.length }));
    save(next);
  };

  const nudge = (path: string, delta: -1 | 1) => {
    const attached = rows.filter((row) => row.attached);
    const neighbour = attached[attached.findIndex((row) => row.path === path) + delta];
    if (neighbour) reorder(path, neighbour.path);
  };

  const endDrag = () => {
    setDragPath(null);
    setOverPath(null);
  };

  if (!repoId) return <EmptyState icon="FileText" title={t("attach.noRepo")} />;
  if (docs.isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={44} />
      </div>
    );
  }
  if (docs.isError) return <ErrorState title={t("attach.loadError")} onRetry={() => docs.refetch()} />;
  if (docs.data && !docs.data.cloned && rows.length === 0) {
    return <EmptyState icon="FileText" title={t("attach.notCloned")} />;
  }

  const attachedCount = rows.filter((row) => row.attached).length;
  const previewDoc = rows.find((row) => row.path === previewPath)?.doc ?? null;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{title}</h2>
        <Badge color="var(--accent)" bg="var(--accent-bg)">
          {t("attach.header", { attached: attachedCount })}
        </Badge>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("attach.filter")}
            aria-label={t("attach.filter")}
            style={s.searchInput}
          />
        </div>
      </div>
      <p style={s.note}>{note}</p>
      {failed && (
        <p role="alert" style={s.error}>
          {t("attach.saveError")}
        </p>
      )}
      <div aria-live="polite" style={s.srOnly}>
        {announcement}
      </div>

      {rows.length === 0 && <div style={s.noMatch}>{t("attach.empty")}</div>}
      {rows.length > 0 && visible.length === 0 && <div style={s.noMatch}>{t("attach.noMatch")}</div>}
      <ul style={s.list}>
        {visible.map((row) => (
          <li
            key={row.path}
            draggable={row.attached && !filtering}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              setDragPath(row.path);
            }}
            onDragOver={(e) => {
              if (!dragPath || !row.attached) return;
              e.preventDefault();
              setOverPath(row.path);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragPath && row.attached) reorder(dragPath, row.path);
              endDrag();
            }}
            onDragEnd={endDrag}
            style={s.row(row.attached, dragPath === row.path, overPath === row.path && dragPath !== row.path)}
          >
            {row.attached && !filtering ? (
              <button
                type="button"
                aria-label={t("attach.dragHandle", { path: row.path })}
                title={t("attach.dragHandle", { path: row.path })}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                  e.preventDefault();
                  nudge(row.path, e.key === "ArrowUp" ? -1 : 1);
                }}
                style={s.handle}
              >
                <Icon.Menu size={14} />
              </button>
            ) : (
              <span style={s.handleSpacer} />
            )}
            <Checkbox
              checked={row.attached}
              onChange={(v) => setAttached(row.path, v)}
              label={<span style={s.srOnly}>{t("attach.toggle", { path: row.path })}</span>}
            />
            <span style={s.pathWrap} title={row.path}>
              <span className="mono" style={s.name(row.attached)}>
                {baseName(row.path)}
              </span>
              {dirName(row.path) && (
                <span className="mono" style={s.dir}>
                  {dirName(row.path)}
                </span>
              )}
            </span>
            {row.doc && <DocCategoryBadge category={row.doc.category} />}
            {row.missing ? (
              <>
                <Badge color="var(--crit)" bg="var(--crit-bg)">
                  {t("attach.missing")}
                </Badge>
                <button type="button" style={s.linkBtn} onClick={() => setAttached(row.path, false)}>
                  {t("attach.detach")}
                </button>
              </>
            ) : (
              <button
                type="button"
                style={s.eyeBtn}
                aria-label={t("attach.previewDoc", { path: row.path })}
                title={t("attach.preview")}
                onClick={() => setPreviewPath(row.path)}
              >
                <Icon.Eye size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {footer && <div style={s.footer}>{footer({ paths: attachedPaths(rows), tokens: attachedTokens(rows) })}</div>}

      {previewDoc && repoId && (
        <DocPreviewDrawer
          repoId={repoId}
          doc={previewDoc}
          attached={rows.find((row) => row.path === previewDoc.path)?.attached ?? false}
          onToggle={(on) => setAttached(previewDoc.path, on)}
          onClose={() => setPreviewPath(null)}
        />
      )}
    </div>
  );
}
