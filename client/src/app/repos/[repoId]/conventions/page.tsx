/* Conventions — /repos/:repoId/conventions. Scans the cloned repo for house
   rules, lets the user accept / reject / edit each candidate, and merges the
   accepted ones into one skill. */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import {
  useConventions,
  useExtractConventions,
  useSetAllConventionStatus,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { SKELETON_CARDS } from "./constants";
import { s } from "./styles";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillFromConventionsModal } from "./_components/CreateSkillFromConventionsModal";

export default function ConventionsPage() {
  const t = useTranslations("conventions");
  const format = useFormatter();
  const router = useRouter();
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: scan, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const setAll = useSetAllConventionStatus(repoId);
  const [creating, setCreating] = React.useState(false);

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const fullName = activeRepo?.full_name ?? t("page.repoFallback");
  const repoName = fullName.split("/").pop()!;
  const candidates = scan?.candidates ?? [];
  const accepted = candidates.filter((c) => c.status === "accepted").length;
  const allAccepted = candidates.length > 0 && accepted === candidates.length;
  const scanned = !!scan?.scanned_at;
  // Failures of the scan and of every decision go to the global mutation error toast.
  const runScan = () => extract.mutate();

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.title}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repoName}>
                {fullName}
              </span>
            </h1>
            <p style={s.subtitle}>
              {scan?.scanned_at
                ? t("page.scanMeta", {
                    count: scan.sample_files,
                    when: format.relativeTime(new Date(scan.scanned_at)),
                  })
                : t("page.subtitle")}
            </p>
          </div>
          {scanned && (
            <div style={s.headerActions}>
              <Button kind="secondary" icon="RefreshCw" onClick={runScan} loading={extract.isPending}>
                {extract.isPending ? t("page.scanning") : t("page.rescan")}
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div style={{ ...s.list, ...s.state }}>
            {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
              <Skeleton key={i} height={170} />
            ))}
          </div>
        ) : isError ? (
          <div style={s.state}>
            <ErrorState
              title={t("page.loadError")}
              body={error instanceof ApiError ? error.message : undefined}
              onRetry={() => refetch()}
            />
          </div>
        ) : !scanned ? (
          <div style={s.state}>
            <EmptyState
              icon="ListChecks"
              title={t("page.empty.title")}
              body={t("page.empty.body")}
              cta={extract.isPending ? t("page.scanning") : t("page.runScan")}
              onCta={runScan}
              ctaLoading={extract.isPending}
            />
          </div>
        ) : candidates.length === 0 ? (
          <div style={s.state}>
            <EmptyState icon="ListChecks" title={t("page.none.title")} body={t("page.none.body")} />
          </div>
        ) : (
          <>
            <div style={s.toolbar}>
              <Button
                kind="secondary"
                icon={allAccepted ? "X" : "Check"}
                disabled={setAll.isPending}
                onClick={() => setAll.mutate(allAccepted ? "pending" : "accepted")}
              >
                {allAccepted ? t("page.deselectAll") : t("page.selectAll")}
              </Button>
              <span style={s.count}>{t("page.acceptedCount", { accepted, total: candidates.length })}</span>
              {accepted > 0 && (
                <div style={s.toolbarRight}>
                  <Button kind="primary" icon="Sparkles" onClick={() => setCreating(true)}>
                    {t("page.createSkill")}
                  </Button>
                </div>
              )}
            </div>
            <div style={s.list}>
              {candidates.map((candidate) => (
                <ConventionCard
                  key={candidate.id}
                  candidate={candidate}
                  busy={update.isPending && update.variables?.id === candidate.id}
                  onAccept={(on) =>
                    update.mutate({ id: candidate.id, patch: { status: on ? "accepted" : "pending" } })
                  }
                  onReject={() => update.mutate({ id: candidate.id, patch: { status: "rejected" } })}
                  onSave={(patch) => update.mutate({ id: candidate.id, patch })}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {creating && (
        <CreateSkillFromConventionsModal
          repoId={repoId}
          repoName={repoName}
          onClose={() => setCreating(false)}
          onCreated={(created) => router.push(`/skills/${created.skill_id}`)}
        />
      )}
    </AppShell>
  );
}
