/* Onboarding Tour view — state machine lives in ./helpers (pickView); this file
   wires data, the expanded-section set and the five sections. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { useQueryClient } from "@tanstack/react-query";
import type { OnboardingSectionKey, OnboardingTour } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useGenerateOnboardingTour, useOnboardingTour } from "@/lib/hooks/onboarding";
import { useRepos } from "@/lib/hooks/repos";
import { useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { useRepoNotFound } from "@/lib/repo-context";
import { ArchitectureBody } from "../ArchitectureBody";
import { CommandList } from "../CommandList";
import { FirstTasks } from "../FirstTasks";
import { RankedList } from "../RankedList";
import { TourBanner, type BannerAction } from "../TourBanner";
import { TourEmptyState } from "../TourEmptyState";
import { TourHeader } from "../TourHeader";
import { TourSection } from "../TourSection";
import { TourToc } from "../TourToc";
import { NO_REPO_ID, SECTION_ICONS, SECTION_ORDER } from "./constants";
import { generateErrorInfo, isIndexReason, pickView, shouldPoll, type TourView } from "./helpers";
import { useActiveSection, useFocusOnLeaveEmpty, useSectionAnchor } from "./hooks";
import { s } from "./styles";

const ALL_EXPANDED: ReadonlySet<OnboardingSectionKey> = new Set(SECTION_ORDER);

export function OnboardingTourView() {
  const t = useTranslations("onboarding");
  const { repoId } = useParams<{ repoId: string }>();
  const noRepo = repoId === NO_REPO_ID;
  const qc = useQueryClient();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: repos } = useRepos();
  const repo = repos?.find((r) => r.id === repoId) ?? null;
  const activeId = noRepo ? null : repoId;

  const { data: state, isLoading, isError, error, refetch } = useOnboardingTour(activeId, { poll: shouldPoll });
  const generate = useGenerateOnboardingTour(activeId);
  const resync = useResyncRepoIntel(activeId);

  const [expanded, setExpanded] = React.useState<ReadonlySet<OnboardingSectionKey>>(ALL_EXPANDED);
  const regenerateRef = React.useRef<HTMLButtonElement>(null);

  const view = state ? pickView(state) : null;
  const sectionsShown = view?.tour != null;
  const [activeSection, setActiveSection] = useActiveSection(SECTION_ORDER, sectionsShown);
  const reveal = React.useCallback((key: OnboardingSectionKey) => {
    setExpanded((prev) => new Set(prev).add(key));
    setActiveSection(key);
  }, [setActiveSection]);
  useSectionAnchor(SECTION_ORDER, sectionsShown, reveal);
  useFocusOnLeaveEmpty(view?.kind ?? null, regenerateRef);

  const crumb = [{ label: t("crumbWorkspace") }, { label: t("title") }];

  if (noRepo) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.state}>
          <EmptyState icon="GitBranch" title={t("selectRepo")} />
        </div>
      </AppShell>
    );
  }
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const toggle = (key: OnboardingSectionKey) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const selectFromToc = (key: OnboardingSectionKey) => {
    reveal(key);
    document.getElementById(key)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  const onGenerate = () => generate.mutate();
  const onReanalyze = () =>
    resync.mutate(undefined, { onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-tour", repoId] }) });

  let body: React.ReactNode;
  if (isLoading || (!state && !isError)) {
    body = (
      <div style={s.state} role="status" aria-busy="true">
        <Skeleton height={260} />
      </div>
    );
  } else if (isError || !view) {
    body = (
      <div style={s.state}>
        <ErrorState title={t("loadError")} body={error instanceof Error ? error.message : undefined} onRetry={() => refetch()} />
      </div>
    );
  } else if (view.kind === "not_cloned") {
    body = (
      <div style={s.state}>
        <EmptyState icon="GitBranch" title={t("notCloned")} />
      </div>
    );
  } else if (view.kind === "indexing") {
    body = (
      <div style={s.state} role="status">
        <EmptyState icon="RefreshCw" title={t("indexing")} />
      </div>
    );
  } else if (view.kind === "empty") {
    body = (
      <div style={s.state}>
        <GenerateError error={generate.error} />
        <TourEmptyState onGenerate={onGenerate} loading={generate.isPending} />
      </div>
    );
  } else if (view.tour) {
    body = (
      <div style={s.page}>
        <div style={s.stack}>
          <TourHeader
            repoName={repo?.full_name.split("/").pop() ?? ""}
            tour={view.tour}
            kind={view.kind}
            generation={view.generation}
            onRegenerate={onGenerate}
            regenerateRef={regenerateRef}
          />
          <Banners view={view} onGenerate={onGenerate} onReanalyze={onReanalyze} />
          <GenerateError error={generate.error} />
          <div style={s.layout}>
            <TourToc keys={SECTION_ORDER} active={activeSection} onSelect={selectFromToc} />
            <div style={s.main}>
              {SECTION_ORDER.map((key) => (
                <TourSection
                  key={key}
                  id={key}
                  title={t(`sections.${key}`)}
                  icon={SECTION_ICONS[key]}
                  expanded={expanded.has(key)}
                  onToggle={() => toggle(key)}
                >
                  <SectionBody
                    sectionKey={key}
                    tour={view.tour as OnboardingTour}
                    placeholder={view.placeholder}
                    repoFullName={repo?.full_name ?? ""}
                  />
                </TourSection>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <AppShell crumb={crumb}>{body}</AppShell>;
}

function GenerateError({ error }: { error: unknown }) {
  const t = useTranslations("onboarding");
  if (!error) return null;
  const info = generateErrorInfo(error);
  const message =
    info.key === "cooldown" ? t("errors.cooldown", { seconds: info.seconds ?? 0 }) : t(`errors.${info.key}`);
  return <TourBanner tone="crit" role="alert" message={message} />;
}

function Banners({
  view,
  onGenerate,
  onReanalyze,
}: {
  view: TourView;
  onGenerate: () => void;
  onReanalyze: () => void;
}) {
  const t = useTranslations("onboarding");
  const retry: BannerAction = { label: t("retry"), onClick: onGenerate };
  const reanalyze: BannerAction = { label: t("reanalyze"), onClick: onReanalyze };
  const reason = view.reason;
  return (
    <>
      {view.kind === "skeleton" && reason && reason !== "no_supported_files" && (
        <TourBanner
          tone="warn"
          message={t(`reasons.${reason}`)}
          actions={reason === "flag_off" ? [] : [isIndexReason(reason) ? reanalyze : retry]}
        />
      )}
      {view.failedRegeneration && (
        <TourBanner
          tone="crit"
          message={t("failedRegeneration", { reason: t(`reasons.${reason ?? "ai_unavailable"}`) })}
          actions={[retry]}
        />
      )}
      {view.stale && (
        <TourBanner
          tone="info"
          message={t("stale")}
          actions={[{ label: t("regenerate"), onClick: onGenerate }, reanalyze]}
        />
      )}
    </>
  );
}

function SectionBody({
  sectionKey,
  tour,
  placeholder,
  repoFullName,
}: {
  sectionKey: OnboardingSectionKey;
  tour: OnboardingTour;
  placeholder: boolean;
  repoFullName: string;
}) {
  const t = useTranslations("onboarding");
  const noFiles = tour.reason === "no_supported_files";
  const list = { repoFullName, indexedSha: tour.index.indexedSha, filesIndexed: tour.index.filesIndexed };
  const emptyText = noFiles ? t("noSupportedFiles") : undefined;
  switch (sectionKey) {
    case "architecture":
      return <ArchitectureBody architecture={tour.architecture} placeholder={placeholder} />;
    case "critical_paths":
      return <RankedList list={tour.criticalPaths} emptyText={emptyText} {...list} />;
    case "run_locally":
      return <CommandList runLocally={tour.runLocally} notice={noFiles ? t("noSupportedFiles") : undefined} />;
    case "reading_path":
      return <RankedList list={tour.readingPath} emptyText={emptyText} numbered {...list} />;
    case "first_tasks":
      return <FirstTasks tasks={tour.firstTasks} placeholder={placeholder} />;
  }
}
