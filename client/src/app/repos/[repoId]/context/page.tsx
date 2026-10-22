/* Project Context — /repos/:repoId/context. Read-only browser for the Markdown
   files in the repo's local checkout; attaching them to agents and skills
   happens on their Context tabs. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { filterDocs, formatTokenTotal } from "@/components/context-docs/helpers";
import { ApiError } from "@/lib/api";
import { useContextDocs } from "@/lib/hooks/context";
import { useRepoNotFound } from "@/lib/repo-context";
import { DocList } from "./_components/DocList";
import { DocPreviewPane } from "./_components/DocPreviewPane";
import { s } from "./styles";

export default function ProjectContextPage() {
  const t = useTranslations("context");
  const format = useFormatter();
  const { repoId } = useParams<{ repoId: string }>();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, error, refetch, isFetching } = useContextDocs(repoId);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<string | null>(null);

  const crumb = [{ label: t("crumbWorkspace") }, { label: t("title") }];
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const docs = data?.docs ?? [];
  const visible = filterDocs(docs, search);
  const selectedDoc = docs.find((doc) => doc.path === selected) ?? null;
  const roots = data?.search_roots?.length
    ? data.search_roots.map((name) => `${name}/`).join(", ")
    : t("searchRootsFallback");

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        {isLoading ? (
          <div style={s.state} role="status" aria-busy="true">
            <Skeleton height={260} />
          </div>
        ) : isError ? (
          <div style={s.state}>
            <ErrorState
              title={t("loadError")}
              body={error instanceof ApiError ? error.message : undefined}
              onRetry={() => refetch()}
            />
          </div>
        ) : !data?.cloned ? (
          <div style={s.state}>
            <EmptyState icon="FileText" title={t("notCloned.title")} body={t("notCloned.body")} />
          </div>
        ) : docs.length === 0 ? (
          <div style={s.state}>
            <EmptyState icon="FileText" title={t("empty.title")} body={t("empty.body", { folders: roots })} />
          </div>
        ) : (
          <>
            <DocList
              docs={visible}
              roots={roots}
              search={search}
              onSearch={setSearch}
              selected={selected}
              onSelect={setSelected}
              onRefresh={() => refetch()}
              refreshing={isFetching}
              truncatedNotice={data.truncated ? t("truncated", { count: docs.length }) : null}
              footer={t("footer", { count: docs.length, tokens: formatTokenTotal(data.total_tokens) })}
              refreshedAt={t("refreshed", { when: format.relativeTime(new Date(data.scanned_at)) })}
            />
            <DocPreviewPane repoId={repoId} doc={selectedDoc} />
          </>
        )}
      </div>
    </AppShell>
  );
}
