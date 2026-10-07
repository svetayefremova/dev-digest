/**
 * PullsPage — filter/sort/search state lives in the URL (not useState), so a
 * reload or a shared link keeps the same filters instead of silently
 * resetting them (F6). Regression guard for that URL-state wiring, plus a
 * smoke check that the Suspense-wrapped default export renders at all (F9).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../messages/en/prReview.json";

const replaceMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo-1" }),
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const PULLS: PrMeta[] = [
  {
    id: "pr-1",
    number: 1,
    title: "Add rate limiting",
    author: "alice",
    branch: "feat/rl",
    base: "main",
    head_sha: "a1",
    additions: 10,
    deletions: 2,
    files_count: 1,
    status: "needs_review",
    opened_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-02T00:00:00Z",
    score: null,
  },
  {
    id: "pr-2",
    number: 2,
    title: "Fix flaky test",
    author: "bob",
    branch: "fix/flaky",
    base: "main",
    head_sha: "b2",
    additions: 3,
    deletions: 1,
    files_count: 1,
    status: "reviewed",
    opened_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-03T00:00:00Z",
    score: 90,
  },
];

vi.mock("@/lib/hooks", () => ({
  usePulls: () => ({ data: PULLS, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useRefreshRepo: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "repo-1", full_name: "acme/demo" } }),
  useRepoNotFound: () => false,
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import PullsPage from "./page";

afterEach(() => {
  cleanup();
  replaceMock.mockClear();
  searchParams = new URLSearchParams();
});

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PullsPage />
    </NextIntlClientProvider>,
  );
}

describe("PullsPage — URL-driven filters", () => {
  it("defaults to the needs_review status filter when the URL has none", () => {
    renderPage();
    expect(screen.getByText("Add rate limiting")).toBeInTheDocument();
    expect(screen.queryByText("Fix flaky test")).not.toBeInTheDocument();
  });

  it("clicking a status chip replaces the URL with that status, preserving other params", () => {
    searchParams = new URLSearchParams("sort=oldest");
    renderPage();

    fireEvent.click(screen.getByText("Reviewed"));

    expect(replaceMock).toHaveBeenCalledTimes(1);
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).toContain("/repos/repo-1/pulls?");
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("status")).toBe("reviewed");
    expect(params.get("sort")).toBe("oldest"); // preserved, not clobbered
  });

  it("changing the search box replaces the URL with a q param", () => {
    searchParams = new URLSearchParams("status=all");
    renderPage();

    fireEvent.change(screen.getByPlaceholderText("Filter pull requests…"), {
      target: { value: "flaky" },
    });

    expect(replaceMock).toHaveBeenCalledTimes(1);
    const url = replaceMock.mock.calls[0]![0] as string;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("q")).toBe("flaky");
    expect(params.get("status")).toBe("all"); // preserved
  });

  it("reads an existing q param from the URL back into the search box", () => {
    searchParams = new URLSearchParams("status=all&q=flaky");
    renderPage();
    // Only the PR matching the persisted search text is shown.
    expect(screen.getByText("Fix flaky test")).toBeInTheDocument();
    expect(screen.queryByText("Add rate limiting")).not.toBeInTheDocument();
  });

  it("reads an existing sort param from the URL (oldest-first ordering)", () => {
    searchParams = new URLSearchParams("status=all&sort=oldest");
    renderPage();
    const titles = screen.getAllByText(/Add rate limiting|Fix flaky test/).map((el) => el.textContent);
    // Both opened at the same time, but PR #1 was updated before PR #2 →
    // oldest-first puts #1 first.
    expect(titles).toEqual(["Add rate limiting", "Fix flaky test"]);
  });
});
