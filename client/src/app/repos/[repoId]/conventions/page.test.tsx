import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ConventionCandidate, ConventionScan } from "@devdigest/shared";
import conventions from "../../../../../messages/en/conventions.json";
import { api } from "@/lib/api";
import ConventionsPage from "./page";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  ApiError: class ApiError extends Error {},
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/payments-api" } }),
  useRepoNotFound: () => false,
}));

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const put = vi.mocked(api.put);

const candidate = (id: string, status: ConventionCandidate["status"]): ConventionCandidate => ({
  id,
  category: "general",
  rule: `Rule ${id}`,
  evidence_path: "src/a.ts",
  evidence_line: 3,
  evidence_end_line: 3,
  evidence_snippet: "const a = 1;",
  confidence: 0.9,
  status,
});
const scan = (candidates: ConventionCandidate[], scanned = true): ConventionScan => ({
  repo_id: "r1",
  sample_files: 14,
  scanned_at: scanned ? new Date().toISOString() : null,
  candidates,
});

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ conventions }}>
        <ConventionsPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ConventionsPage", () => {
  it("before the first scan offers Run Scan (and no ReScan), then lists what the scan found", async () => {
    get.mockResolvedValue(scan([], false));
    post.mockResolvedValue(scan([candidate("a", "pending")]));
    renderPage();

    const run = await screen.findByRole("button", { name: "Run Scan" });
    expect(screen.queryByRole("button", { name: "ReScan" })).not.toBeInTheDocument();
    fireEvent.click(run);

    expect(await screen.findByText("Rule a")).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/repos/r1/conventions/extract");
    expect(screen.getByRole("button", { name: "ReScan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run Scan" })).not.toBeInTheDocument();
    expect(screen.getByText(/Detected from 14 sample files/)).toBeInTheDocument();
    expect(screen.getByText("acme/payments-api")).toBeInTheDocument();
  });

  it("shows Create skill only once a candidate is accepted", async () => {
    get.mockResolvedValue(scan([candidate("a", "pending"), candidate("b", "pending")]));
    put.mockResolvedValue(candidate("a", "accepted"));
    renderPage();

    expect(await screen.findByText("0 of 2 accepted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Accept" })[0]!);
    expect(await screen.findByRole("button", { name: "Create skill" })).toBeInTheDocument();
    expect(put).toHaveBeenCalledWith("/conventions/a", { status: "accepted" });
    expect(screen.getByText("1 of 2 accepted")).toBeInTheDocument();
  });

  it("a rejected candidate leaves the list", async () => {
    get.mockResolvedValue(scan([candidate("a", "accepted"), candidate("b", "pending")]));
    put.mockResolvedValue(candidate("b", "rejected"));
    renderPage();

    await screen.findByText("Rule b");
    fireEvent.click(screen.getAllByRole("button", { name: "Reject" })[1]!);
    await waitFor(() => expect(screen.queryByText("Rule b")).not.toBeInTheDocument());
    expect(put).toHaveBeenCalledWith("/conventions/b", { status: "rejected" });
    expect(screen.getByText("1 of 1 accepted")).toBeInTheDocument();
  });
});
