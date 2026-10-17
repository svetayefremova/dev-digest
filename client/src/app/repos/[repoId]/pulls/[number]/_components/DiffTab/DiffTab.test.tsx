import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";
import intent from "../../../../../../../../messages/en/intent.json";

const hooks = vi.hoisted(() => ({
  reviews: { data: undefined as unknown, isSuccess: true },
  smart: { data: undefined as unknown },
  mutate: vi.fn(),
}));

vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => hooks.reviews,
  useSmartDiff: () => hooks.smart,
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useFindingAction: () => ({ mutate: hooks.mutate, isPending: false }),
}));

import { DiffTab } from "./DiffTab";

const PATCH = "@@ -1,2 +1,3 @@\n a\n+b\n c";

const FILES: PrFile[] = [
  { path: "README.md", additions: 1, deletions: 0, patch: PATCH },
  { path: "src/a.ts", additions: 1, deletions: 0, patch: PATCH },
  { path: "src/a.test.ts", additions: 1, deletions: 0, patch: PATCH },
];

const SMART: SmartDiff = {
  groups: [
    { role: "core", files: [{ path: "src/a.ts", additions: 1, deletions: 0, finding_lines: [2] }] },
    { role: "tests", files: [{ path: "src/a.test.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "docs", files: [{ path: "README.md", additions: 1, deletions: 0, finding_lines: [] }] },
  ],
  split_suggestion: { too_big: false, total_lines: 3, proposed_splits: [] },
};

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
  file: "src/a.ts",
  start_line: 2,
  end_line: 2,
  rationale: "A secret is committed.",
  suggestion: null,
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

const REVIEW: ReviewRecord = {
  id: "r1",
  pr_id: "pr1",
  agent_id: "a1",
  run_id: null,
  kind: "review",
  verdict: "request_changes",
  summary: null,
  score: 40,
  model: null,
  created_at: "2026-01-01T00:00:00Z",
  cost_usd: null,
  findings: [FINDING],
};

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell, intent }}>
      <DiffTab prId="pr1" filesCount={3} additions={3} deletions={0} files={FILES} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  hooks.reviews = { data: [REVIEW], isSuccess: true };
  hooks.smart = { data: SMART };
  hooks.mutate.mockReset();
});
afterEach(cleanup);

describe("DiffTab", () => {
  it("groups files by role in smart order and shows a flat list in original order", () => {
    renderTab();
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Core", "Tests", "Docs"]);

    fireEvent.click(screen.getByRole("button", { name: "Original order" }));

    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
    const paths = screen
      .getAllByText(/^(README\.md|src\/a\.ts|src\/a\.test\.ts)$/)
      .map((el) => el.textContent);
    expect(paths).toEqual(["README.md", "src/a.ts", "src/a.test.ts"]);
  });

  it("shows the findings count on the group header", () => {
    renderTab();
    const counter = screen.getByLabelText("1 finding in 1 file");
    expect(counter).toHaveTextContent("1");
  });

  it("hides the finding card but keeps the severity label, and shows it again on re-click", () => {
    renderTab();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Hide comments \(1\)/ }));
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Show comments \(1\)/ }));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("accepts a finding from the expanded inline card", () => {
    renderTab();
    fireEvent.click(screen.getByText("Hardcoded secret"));
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(hooks.mutate).toHaveBeenCalledWith({ findingId: "f1", action: "accept", prId: "pr1" });
  });

  it("shows the empty state only when there are no reviews", () => {
    hooks.reviews = { data: [], isSuccess: true };
    renderTab();
    expect(screen.getByText(/No review yet/)).toBeInTheDocument();
    cleanup();

    hooks.reviews = { data: [REVIEW], isSuccess: true };
    renderTab();
    expect(screen.queryByText(/No review yet/)).not.toBeInTheDocument();
  });
});
