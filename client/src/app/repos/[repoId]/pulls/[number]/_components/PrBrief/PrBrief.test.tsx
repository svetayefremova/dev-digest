import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord, RunSummary } from "@devdigest/shared";
import brief from "../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../messages/en/prReview.json";
import { PrBrief } from "./PrBrief";

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ brief, prReview }}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("PrBrief", () => {
  it("shows an empty state before any review", () => {
    wrap(<PrBrief review={undefined} run={undefined} />);
    expect(screen.getByText(/No review yet/)).toBeInTheDocument();
  });

  it("shows verdict, score, cost and compact token usage of the latest run", () => {
    const review = {
      id: "r1",
      pr_id: "p",
      agent_id: null,
      run_id: "run1",
      kind: "review",
      verdict: "request_changes",
      summary: "Two blockers before merge.",
      score: 61,
      model: "m",
      created_at: "2026-10-16",
      cost_usd: 0.014,
      findings: [],
    } as ReviewRecord;
    const run = { run_id: "run1", tokens_in: 8240, tokens_out: 1300, cost_usd: 0.014 } as RunSummary;
    wrap(<PrBrief review={review} run={run} />);
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
    expect(screen.getByText("$0.01")).toBeInTheDocument();
    expect(screen.getByText("8.2K→1.3K")).toBeInTheDocument();
  });
});
