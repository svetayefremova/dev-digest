"use client";

import React from "react";
import { SectionLabel, Button } from "@devdigest/ui";
import {
  DiffViewer,
  type DiffCommentApi,
  type DiffFileGroup,
  type DiffFindingApi,
} from "@/components/diff-viewer";
import { useTranslations } from "next-intl";
import {
  usePrComments,
  useCreatePrComment,
  usePrReviews,
  useSmartDiff,
  useFindingAction,
} from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { COLLAPSED_ROLES, ROLE_COLOR, ROLE_HINT_KEY, ROLE_LABEL_KEY } from "./constants";
import { findingsByPath, toViewerGroups } from "./helpers";
import { OrderToggle, type DiffOrder } from "./OrderToggle";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  /** PR-level line totals (match the header, even when only some files are persisted). */
  additions: number;
  deletions: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
}

export function DiffTab({ prId, filesCount, additions, deletions, files, canComment, repoFullName, headSha }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: reviews, isSuccess: reviewsLoaded } = usePrReviews(prId);
  const { data: smart } = useSmartDiff(prId);
  const action = useFindingAction();
  const [order, setOrder] = React.useState<DiffOrder>("smart");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const byPath = findingsByPath(reviews ?? []);
  let findingCount = 0;
  for (const list of byPath.values()) findingCount += list.length;

  // One toggle hides GitHub comments AND finding cards. Until the user picks,
  // it defaults to "shown" only when there are findings (a clean diff otherwise).
  const [showChoice, setShowChoice] = React.useState<boolean | null>(null);
  const showComments = showChoice ?? findingCount > 0;
  const setShowComments = (v: boolean) => setShowChoice(v);

  const commentCount = (comments?.length ?? 0) + findingCount;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const findings: DiffFindingApi = {
    byPath,
    show: showComments,
    render: (f) => (
      <FindingCard
        f={f}
        pending={action.isPending}
        repoFullName={repoFullName}
        headSha={headSha}
        onAction={(act) => action.mutate({ findingId: f.id, action: act, prId: prId ?? undefined })}
      />
    ),
  };

  // Smart mode needs the server grouping; while it loads (or errors) fall back to the flat list.
  const groups: DiffFileGroup[] | undefined =
    order === "smart" && smart
      ? toViewerGroups(smart, files, byPath).map((g) => ({
          id: g.role,
          label: t(ROLE_LABEL_KEY[g.role]),
          hint: t(ROLE_HINT_KEY[g.role]),
          meta:
            t("smartDiff.filesCount", { count: g.files.length }) +
            (g.withFindings > 0 ? " · " + t("smartDiff.filesWithFindings", { count: g.withFindings }) : ""),
          color: ROLE_COLOR[g.role],
          files: g.files,
          defaultOpen: COLLAPSED_ROLES.has(g.role) ? false : undefined,
        }))
      : undefined;

  return (
    <section>
      <SectionLabel icon="Code">{t("smartDiff.reviewerOrdered")}</SectionLabel>
      <div style={s.toolbar}>
        <span className="tnum" style={s.stats}>
          {t("smartDiff.filesCount", { count: filesCount })} · <span style={s.add}>+{additions}</span>{" "}
          <span style={s.del}>−{deletions}</span>
        </span>
        {commentCount > 0 && (
          <Button
            kind="ghost"
            size="sm"
            icon={showComments ? "EyeOff" : "Eye"}
            onClick={() => setShowComments(!showComments)}
          >
            {t(showComments ? "smartDiff.hideComments" : "smartDiff.showComments", { count: commentCount })}
          </Button>
        )}
        <OrderToggle value={order} onChange={setOrder} />
      </div>
      {reviewsLoaded && (reviews?.length ?? 0) === 0 && (
        <div style={s.noReview}>{t("smartDiff.noReviewYet")}</div>
      )}
      <DiffViewer files={files} commenting={commenting} groups={groups} findings={findings} />
    </section>
  );
}
