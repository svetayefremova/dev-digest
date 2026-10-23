"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingGeneration, OnboardingTour } from "@devdigest/shared";
import type { ViewKind } from "../OnboardingTourView/helpers";
import { elapsedSeconds, indexCounts } from "./helpers";
import { s } from "./styles";

export function TourHeader({
  repoName,
  tour,
  kind,
  generation,
  onRegenerate,
  regenerateRef,
}: {
  repoName: string;
  tour: OnboardingTour | null;
  kind: ViewKind;
  generation: OnboardingGeneration | null;
  onRegenerate: () => void;
  /** Owned by the view, which moves focus here when the empty state's CTA unmounts. */
  regenerateRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations("onboarding");
  const format = useFormatter();
  const generating = generation?.status === "running";
  const status = generation?.status ?? null;

  // Elapsed time while a generation runs (1 s tick; an external clock, so an effect is right).
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!generating) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [generating]);

  // Announce finish/fail; focus stays where it is (Regenerate), AC-45.
  const [announcement, setAnnouncement] = React.useState("");
  const prevStatus = React.useRef(status);
  React.useEffect(() => {
    if (prevStatus.current === "running" && status === "succeeded") setAnnouncement(t("announce.succeeded"));
    if (prevStatus.current === "running" && status === "failed") setAnnouncement(t("announce.failed"));
    prevStatus.current = status;
  }, [status, t]);

  const counts = tour ? indexCounts(tour.index) : null;
  const generatedAt = tour?.generatedAt ? new Date(tour.generatedAt) : null;
  let subline: string | null = null;
  if (tour && counts) {
    const values = { n: format.number(counts.n), m: format.number(counts.m ?? 0) };
    if (generatedAt) {
      const time = format.relativeTime(generatedAt);
      subline = counts.partial ? t("sublinePartial", { ...values, time }) : t("subline", { ...values, time });
    } else {
      subline = counts.partial ? t("sublineSkeletonPartial", values) : t("sublineSkeleton", values);
    }
  }
  const showRegenerate = kind === "generated" || kind === "skeleton";

  return (
    <header style={{ position: "relative" }}>
      <div style={s.row}>
        <div>
          <h1 style={s.title}>
            {t.rich("heading", {
              repoName,
              repo: (chunks) => (
                <span className="mono" style={s.repo}>
                  {chunks}
                </span>
              ),
            })}
          </h1>
          {subline && (
            <p style={s.subline} title={generatedAt ? format.dateTime(generatedAt, { dateStyle: "medium", timeStyle: "short" }) : undefined}>
              {subline}
            </p>
          )}
          {counts?.partial && <p style={s.notice}>{t("partialNotice")}</p>}
        </div>
        {showRegenerate && (
          <div style={s.actions}>
            {generating && generation && (
              <span style={s.elapsed}>{t("elapsed", { seconds: elapsedSeconds(generation.startedAt, now) })}</span>
            )}
            <button
              ref={regenerateRef}
              type="button"
              style={s.regen(generating)}
              aria-disabled={generating}
              onClick={() => {
                if (!generating) onRegenerate();
              }}
            >
              <Icon.RefreshCw size={13} aria-hidden />
              {t("regenerate")}
            </button>
          </div>
        )}
      </div>
      <div role="status" aria-live="polite" style={s.live}>
        {announcement}
      </div>
    </header>
  );
}
