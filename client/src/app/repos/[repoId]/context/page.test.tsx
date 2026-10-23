import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContextDoc, ContextDocContent, ContextDocList } from "@devdigest/shared";
import context from "../../../../../messages/en/context.json";
import { api } from "@/lib/api";
import ProjectContextPage from "./page";

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

const UPDATED = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();

const doc = (path: string, over: Partial<ContextDoc> = {}): ContextDoc => ({
  path,
  category: "docs",
  tokens: 100,
  size: 500,
  updated_at: UPDATED,
  previewable: true,
  used_by_agents: 0,
  ...over,
});

const list = (docs: ContextDoc[], over: Partial<ContextDocList> = {}): ContextDocList => ({
  cloned: true,
  docs,
  truncated: false,
  total_tokens: docs.reduce((n, d) => n + (d.tokens ?? 0), 0),
  scanned_at: new Date().toISOString(),
  ...over,
});

/** Route `api.get` by URL: the list endpoint and the per-file content endpoint. */
function serve(listing: ContextDocList | (() => Promise<ContextDocList>), contents: Record<string, ContextDocContent> = {}) {
  get.mockImplementation(async (url: string) => {
    if (url.startsWith("/repos/r1/context/file?path=")) {
      const path = decodeURIComponent(url.split("path=")[1]!);
      const found = contents[path];
      if (!found) throw new Error(`no content for ${path}`);
      return found;
    }
    return typeof listing === "function" ? listing() : listing;
  });
}

const content = (path: string, text: string): ContextDocContent => ({ path, content: text, reason: null });

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ context }}>
        <ProjectContextPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const FORBIDDEN_CONTROLS = /edit|upload|new file|new folder|add a spec/i;

describe("ProjectContextPage", () => {
  it("SPEC-01 AC-9: shows a loading indicator in place of the list while the request is pending", () => {
    get.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("SPEC-01 AC-10: a failed list request shows 'Couldn't load specs' with a Retry that loads the list", async () => {
    get.mockRejectedValueOnce(new Error("boom"));
    renderPage();
    expect(await screen.findByText(/Couldn.t load specs/)).toBeInTheDocument();

    serve(list([doc("docs/a.md")]));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("option", { name: /docs\/a\.md/ })).toBeInTheDocument();
  });

  it("SPEC-01 AC-11: a repo without a checkout shows 'Repository not cloned yet' and no list", async () => {
    serve(list([], { cloned: false }));
    renderPage();
    expect(await screen.findByText("Repository not cloned yet")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("SPEC-01 AC-8 / AC-15: with no matching files it shows 'No spec files yet', opt-in guidance naming the searched folders and no Add/Edit/upload control", async () => {
    serve(list([], { search_roots: ["specs", "docs", "insights"] }));
    renderPage();
    expect(await screen.findByText("No spec files yet")).toBeInTheDocument();
    expect(screen.getByText(/specs\/, docs\/, insights\//)).toBeInTheDocument();
    expect(screen.getByText(/opt-in|nothing is shared with a run unless you attach it/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: FORBIDDEN_CONTROLS })).not.toBeInTheDocument();
  });

  it("SPEC-01 AC-1 / AC-2 / AC-20: rows are in the served order, show only the file path (no badge) and expose path and category in their accessible name", async () => {
    serve(
      list([
        doc("docs/b.md", { category: "docs" }),
        doc("insights/perf.md", { category: "insights" }),
        doc("specs/a.md", { category: "specs" }),
      ]),
    );
    renderPage();
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.getAttribute("aria-label"))).toEqual([
      "docs/b.md, docs",
      "insights/perf.md, insights",
      "specs/a.md, specs",
    ]);
    const row = within(options[1]!);
    expect(row.getByText("insights/perf.md")).toBeInTheDocument();
    expect(row.queryByText("insights")).not.toBeInTheDocument();
    expect(row.queryByText(/tokens/)).not.toBeInTheDocument();
  });

  it("SPEC-01 AC-3 / AC-4 / AC-6: selecting a row renders the file as Markdown with path, category badge, tokens, relative time (absolute on hover) and 'Used by 3 agents'", async () => {
    serve(list([doc("specs/a.md", { category: "specs", tokens: 178, used_by_agents: 3 }), doc("docs/b.md")]), {
      "specs/a.md": content("specs/a.md", "# Rate limits\n\n- burst of 20"),
    });
    renderPage();
    fireEvent.click(await screen.findByRole("option", { name: "specs/a.md, specs" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Rate limits" })).toBeInTheDocument();
    expect(screen.getByText("burst of 20")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/repos/r1/context/file?path=specs%2Fa.md");
    expect(screen.getByText("≈ 178 tokens")).toBeInTheDocument();
    expect(screen.getByLabelText("Category: specs")).toBeInTheDocument();
    expect(screen.getByText("Used by 3 agents")).toBeInTheDocument();
    const when = screen.getByTitle(new Date(UPDATED).toLocaleString());
    expect(when).toHaveTextContent(/ago/);
    expect(screen.queryByRole("textbox", { name: /content|edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: FORBIDDEN_CONTROLS })).not.toBeInTheDocument();
  });

  it("SPEC-01 AC-14: the footer reads '12 files · ≈ 4.2k tokens total' with the last refresh time", async () => {
    const docs = Array.from({ length: 12 }, (_, i) => doc(`docs/f${String(i).padStart(2, "0")}.md`, { tokens: 352 }));
    serve(list(docs, { total_tokens: 4230 }));
    renderPage();
    expect(await screen.findByText("12 files · ≈ 4.2k tokens total")).toBeInTheDocument();
    expect(screen.getByText(/^last /)).toBeInTheDocument();
  });

  it("SPEC-01 AC-14: a total below 1,000 is a plain integer", async () => {
    serve(list([doc("docs/a.md", { tokens: 850 })], { total_tokens: 850 }));
    renderPage();
    expect(await screen.findByText("1 file · ≈ 850 tokens total")).toBeInTheDocument();
  });

  it("SPEC-01 AC-7: typing in the filter box keeps only paths containing the text, case-insensitively", async () => {
    serve(list([doc("docs/API-guide.md"), doc("docs/other.md"), doc("specs/api.md")]));
    renderPage();
    await screen.findAllByRole("option");
    fireEvent.change(screen.getByRole("textbox", { name: "Filter files…" }), { target: { value: "Api" } });
    expect(screen.getAllByRole("option").map((o) => o.getAttribute("aria-label"))).toEqual([
      "docs/API-guide.md, docs",
      "specs/api.md, docs",
    ]);
  });

  it("SPEC-01 AC-16: a file that is too large or unreadable stays listed and its preview says 'Too large or unreadable to preview'", async () => {
    serve(list([doc("docs/big.md", { previewable: false, tokens: null })]));
    renderPage();
    fireEvent.click(await screen.findByRole("option", { name: /docs\/big\.md/ }));
    expect(await screen.findByText("Too large or unreadable to preview")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /docs\/big\.md/ })).toBeInTheDocument();
  });

  it("SPEC-01 AC-17: a truncated listing shows a truncation notice", async () => {
    serve(list([doc("docs/a.md")], { truncated: true }));
    renderPage();
    expect(await screen.findByText(/Showing the first 1 files only/)).toBeInTheDocument();
  });

  it("SPEC-01 AC-17: a complete listing shows no truncation notice", async () => {
    serve(list([doc("docs/a.md")]));
    renderPage();
    await screen.findByRole("option");
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();
  });

  it("SPEC-01 AC-12 / AC-13: Refresh is disabled while the re-scan is in flight, then the rows and footer update", async () => {
    let release!: (value: ContextDocList) => void;
    const first = list([doc("docs/a.md", { tokens: 100 })]);
    const second = list([doc("docs/a.md", { tokens: 100 }), doc("docs/new.md", { tokens: 50 })]);
    let calls = 0;
    serve(() => {
      calls += 1;
      return calls === 1 ? Promise.resolve(first) : new Promise<ContextDocList>((resolve) => (release = resolve));
    });
    renderPage();
    expect(await screen.findByText("1 file · ≈ 100 tokens total")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    const busy = await screen.findByRole("button", { name: "Refreshing…" });
    expect(busy).toBeDisabled();

    release(second);
    expect(await screen.findByText("2 files · ≈ 150 tokens total")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /docs\/new\.md/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());
  });

  it("SPEC-01 AC-20: ArrowDown moves focus to the next row and Enter opens that file", async () => {
    serve(list([doc("docs/a.md"), doc("docs/b.md")]), {
      "docs/a.md": content("docs/a.md", "# Alpha"),
      "docs/b.md": content("docs/b.md", "# Bravo"),
    });
    renderPage();
    const [first, second] = await screen.findAllByRole("option");
    first!.focus();
    fireEvent.keyDown(first!, { key: "ArrowDown" });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second!, { key: "Enter" });
    expect(await screen.findByRole("heading", { level: 1, name: "Bravo" })).toBeInTheDocument();
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(first).toHaveAttribute("aria-selected", "false");
  });
});
