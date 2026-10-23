import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, within, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  OnboardingGeneration,
  OnboardingRankedEntry,
  OnboardingTour,
  OnboardingTourState,
} from "@devdigest/shared";
import onboarding from "../../../../../messages/en/onboarding.json";
import { api } from "@/lib/api";
import OnboardingTourPage from "./page";

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), parse: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: mermaid }));

let params = { repoId: "r1" };
vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  ApiError: class ApiError extends Error {},
}));
vi.mock("next/navigation", () => ({
  useParams: () => params,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, crumb }: { children: React.ReactNode; crumb?: { label: string }[] }) => (
    <div>
      <nav aria-label="Breadcrumb">{crumb?.map((c) => c.label).join(" > ")}</nav>
      {children}
    </div>
  ),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/payments-api" } }),
  useRepoNotFound: () => false,
}));

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const REPOS = [{ id: "r1", full_name: "acme/payments-api", default_branch: "main" }];
const GENERATE = "/repos/r1/onboarding/generate";
const RESYNC = "/repos/r1/resync";

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();

const tour = (over: Partial<OnboardingTour> = {}): OnboardingTour => ({
  mode: "generated",
  reason: null,
  architecture: {
    summary: "Summary A",
    diagram: null,
    stack: ["TypeScript", "Fastify"],
    topLevelDirs: ["src", "docs"],
  },
  criticalPaths: { entries: [], truncated: false },
  readingPath: { entries: [], truncated: false },
  runLocally: { commands: [{ command: "pnpm dev", comment: null, source: "package_script" }], envVars: [] },
  firstTasks: [{ title: "Add a health check", path: "src/health.ts", isDirectory: false, importers: 2, complexity: "low" }],
  index: { filesIndexed: 4800, filesSkipped: 0, status: "full", indexedSha: "abc123", indexUpdatedAt: daysAgo(2) },
  generatedAt: daysAgo(2),
  ...over,
});

const skeleton = (over: Partial<OnboardingTour> = {}): OnboardingTour =>
  tour({
    mode: "skeleton",
    reason: "ai_unavailable",
    architecture: { summary: null, diagram: null, stack: ["TypeScript"], topLevelDirs: ["src"] },
    firstTasks: null,
    generatedAt: null,
    ...over,
  });

const gen = (over: Partial<OnboardingGeneration> = {}): OnboardingGeneration => ({
  id: "11111111-1111-4111-8111-111111111111",
  status: "running",
  phase: "generating",
  reason: null,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  ...over,
});

const state = (over: Partial<OnboardingTourState> = {}): OnboardingTourState => ({
  cloned: true,
  repoIntelEnabled: true,
  indexing: false,
  tour: null,
  skeleton: null,
  latestGeneration: null,
  stale: false,
  ...over,
});

const entry = (i: number, over: Partial<OnboardingRankedEntry> = {}): OnboardingRankedEntry => ({
  path: `src/file-${i}.ts`,
  rank: 1 / (i + 1),
  importers: 0,
  endpoints: 0,
  reason: null,
  ...over,
});

let served: OnboardingTourState;

/** Serve `s` from the tour-state endpoint; reassigning `served` changes what the next refetch returns. */
function serve(s: OnboardingTourState) {
  served = s;
  get.mockImplementation(async (url: string) => {
    if (url === "/repos") return REPOS;
    if (url === "/repos/r1/onboarding") return served;
    throw new Error(`unexpected GET ${url}`);
  });
}

const stateGets = () => get.mock.calls.filter(([url]) => url === "/repos/r1/onboarding").length;

const SECTION_TITLES = ["Architecture overview", "Critical paths", "How to run locally", "Guided reading path", "First tasks"];

const scrollIntoView = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  scrollIntoView.mockReset();
  params = { repoId: "r1" };
  mermaid.parse.mockResolvedValue(true);
  mermaid.render.mockResolvedValue({ svg: "<svg></svg>" });
  post.mockImplementation(async (url: string) => (url === RESYNC ? { status: "queued" } : { generation: gen() }));
  Element.prototype.scrollIntoView = scrollIntoView;
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ onboarding }}>
        <OnboardingTourPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** Only the interval timers are faked: waitFor/findBy keep working off DOM mutations. */
const fakeIntervals = () => vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
const advance = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });

describe("OnboardingTourPage frame", () => {
  it("SPEC-02 AC-4: with no repo selected it shows 'Select a repository' instead of the tour", async () => {
    params = { repoId: "_" };
    serve(state({ tour: tour() }));
    renderPage();
    expect(await screen.findByText("Select a repository")).toBeInTheDocument();
    expect(screen.queryByText("Summary A")).not.toBeInTheDocument();
    expect(stateGets()).toBe(0);
  });

  it("SPEC-02 AC-5 / AC-49: heading 'Onboarding for payments-api' with the name in mono, the breadcrumb 'Workspace > Onboarding Tour' and no Share link", async () => {
    serve(state({ tour: tour() }));
    renderPage();
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Onboarding for payments-api");
    expect(within(h1).getByText("payments-api")).toHaveClass("mono");
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Workspace > Onboarding Tour"),
    );
    expect(screen.queryByText(/share link/i)).not.toBeInTheDocument();
  });

  it("SPEC-02 AC-6: a generated tour reads 'Generated from index of 4,800 files · last refreshed 2 days ago' with the absolute time on hover", async () => {
    const generatedAt = daysAgo(2);
    serve(state({ tour: tour({ generatedAt }) }));
    renderPage();
    const subline = await screen.findByText(/^Generated from index of 4,800 files · last refreshed /);
    expect(subline).toHaveTextContent("last refreshed 2 days ago");
    const title = subline.getAttribute("title") ?? "";
    expect(title).toContain(String(new Date(generatedAt).getFullYear()));
    expect(title).not.toMatch(/ago/);
  });

  it("SPEC-02 AC-7: a partial index (5,000 indexed + 7,450 skipped) reads '5,000 of 12,450 files' and shows the Partial index notice", async () => {
    serve(
      state({
        tour: tour({ index: { filesIndexed: 5000, filesSkipped: 7450, status: "partial", indexedSha: "abc123", indexUpdatedAt: daysAgo(1) } }),
      }),
    );
    renderPage();
    expect(await screen.findByText(/Generated from index of 5,000 of 12,450 files/)).toBeInTheDocument();
    expect(screen.getByText("Partial index: sections cover indexed files only.")).toBeInTheDocument();
  });

  it("SPEC-02 AC-6: a skeleton (no generation time) reads 'Generated from index of 4,800 files' with no 'last refreshed'", async () => {
    serve(state({ skeleton: skeleton(), latestGeneration: gen({ status: "failed", reason: "ai_unavailable", finishedAt: new Date().toISOString() }) }));
    renderPage();
    expect(await screen.findByText("Generated from index of 4,800 files")).toBeInTheDocument();
    expect(screen.queryByText(/last refreshed/)).not.toBeInTheDocument();
  });
});

describe("OnboardingTourPage empty and degraded states", () => {
  it("SPEC-02 AC-39: with no tour it shows the empty state with the exact copy, makes no request until the single CTA is clicked", async () => {
    serve(state());
    renderPage();
    const cta = await screen.findByRole("button", { name: "Generate onboarding tour" });
    expect(cta.textContent).not.toContain("+");
    expect(cta.querySelector("svg")).not.toBeNull();
    // Title (outside the button) carries the same exact text.
    expect(screen.getAllByText("Generate onboarding tour").some((el) => !cta.contains(el))).toBe(true);
    expect(
      screen.getByText(
        "DevDigest indexes the repo and writes a guided tour: architecture, critical paths, how to run, a reading order, and first tasks. Takes 30–60s and ~5,000 tokens.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(post).not.toHaveBeenCalled();

    fireEvent.click(cta);

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith(GENERATE);
  });

  it("SPEC-02 AC-29 / AC-26: with repo intelligence off it shows the skeleton with 'Repository index is turned off', no retry action and the first-tasks placeholder", async () => {
    serve(state({ repoIntelEnabled: false, skeleton: skeleton({ reason: "flag_off" }) }));
    renderPage();
    expect(await screen.findByText("Repository index is turned off")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-analyze" })).not.toBeInTheDocument();
    expect(screen.getByText("Available once the AI summary is generated")).toBeInTheDocument();
  });

  it("SPEC-02 AC-30: a failed index shows the skeleton with a 'Re-analyze' action that requests a re-index", async () => {
    serve(state({ skeleton: skeleton({ reason: "index_failed" }) }));
    renderPage();
    const reanalyze = await screen.findByRole("button", { name: "Re-analyze" });
    expect(screen.getByText("Repository index failed")).toBeInTheDocument();
    fireEvent.click(reanalyze);
    await waitFor(() => expect(post).toHaveBeenCalledWith(RESYNC));
    expect(post).not.toHaveBeenCalledWith(GENERATE);
  });

  it("SPEC-02 AC-31: an index with no supported source files shows the no-supported-files message in place of the ranked sections and still shows the run commands", async () => {
    serve(
      state({
        skeleton: skeleton({
          reason: "no_supported_files",
          index: { filesIndexed: 0, filesSkipped: 0, status: "full", indexedSha: "abc123", indexUpdatedAt: daysAgo(1) },
          criticalPaths: { entries: [], truncated: false },
          readingPath: { entries: [], truncated: false },
          runLocally: { commands: [{ command: "make serve", comment: null, source: "package_script" }], envVars: [] },
        }),
      }),
    );
    renderPage();
    const message = "No supported source files indexed (.ts, .tsx, .js, .jsx, .mjs, .cjs)";
    await screen.findAllByText(message);
    for (const name of ["Critical paths", "Guided reading path"]) {
      const region = screen.getByRole("region", { name });
      expect(within(region).getByText(message)).toBeInTheDocument();
      expect(within(region).queryAllByRole("listitem")).toHaveLength(0);
    }
    expect(screen.getByText("make serve")).toBeInTheDocument();
  });

  it("SPEC-02 AC-23: a failed model call shows the skeleton with 'AI summary unavailable' and a Retry that starts a new generation", async () => {
    serve(state({ skeleton: skeleton(), latestGeneration: gen({ status: "failed", reason: "ai_unavailable", finishedAt: new Date().toISOString() }) }));
    renderPage();
    expect(await screen.findByText("AI summary unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(GENERATE));
  });

  it("SPEC-02 AC-22: invalid model output shows the skeleton with 'AI output invalid'", async () => {
    serve(
      state({
        skeleton: skeleton({ reason: "ai_output_invalid" }),
        latestGeneration: gen({ status: "failed", reason: "ai_output_invalid", finishedAt: new Date().toISOString() }),
      }),
    );
    renderPage();
    expect(await screen.findByText("AI output invalid")).toBeInTheDocument();
    expect(screen.queryByText("Summary A")).not.toBeInTheDocument();
  });

  it("SPEC-02 AC-27: a repo without a checkout shows 'Repository not cloned yet' and no Regenerate action", async () => {
    serve(state({ cloned: false }));
    renderPage();
    expect(await screen.findByText("Repository not cloned yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate onboarding tour/ })).not.toBeInTheDocument();
  });

  it("SPEC-02 AC-28 / AC-46: while indexing it shows 'Indexing in progress', polls the state every 5 s and offers generation once indexing finished", async () => {
    fakeIntervals();
    serve(state({ indexing: true }));
    renderPage();
    expect(await screen.findByText("Indexing in progress")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate onboarding tour/ })).not.toBeInTheDocument();
    expect(stateGets()).toBe(1);

    await advance(4000);
    expect(stateGets()).toBe(1);

    served = state({ indexing: false });
    await advance(1000);

    expect(await screen.findByRole("button", { name: /Generate onboarding tour/ })).toBeInTheDocument();
    expect(stateGets()).toBe(2);
    expect(screen.queryByText("Indexing in progress")).not.toBeInTheDocument();
  });

  it("SPEC-02 AC-40: a generate request answered 429 shows the alert 'Try again in 42s'", async () => {
    serve(state());
    post.mockRejectedValue(
      Object.assign(new Error("cooldown"), { status: 429, code: "onboarding_cooldown", details: { retryAfterSeconds: 42 } }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Generate onboarding tour/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again in 42s");
  });
});

describe("OnboardingTourPage generation lifecycle", () => {
  it("SPEC-02 AC-32 / AC-45: a first generation shows the skeleton, a disabled focused Regenerate with elapsed time, then the generated sections and an announcement with focus kept on Regenerate", async () => {
    fakeIntervals();
    serve(state());
    renderPage();
    const cta = await screen.findByRole("button", { name: /Generate onboarding tour/ });

    served = state({ skeleton: skeleton({ reason: null }), latestGeneration: gen() });
    fireEvent.click(cta);

    const regenerate = await screen.findByRole("button", { name: "Regenerate" });
    await waitFor(() => expect(regenerate).toHaveAttribute("aria-disabled", "true"));
    expect(regenerate).toHaveFocus();
    expect(screen.getByText(/Generating… \d+s/)).toBeInTheDocument();
    // Skeleton placeholders: index facts are shown, AI-only content is a busy placeholder.
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getAllByRole("status").some((el) => el.getAttribute("aria-busy") === "true")).toBe(true);
    expect(screen.queryByText("Summary A")).not.toBeInTheDocument();

    served = state({ tour: tour(), latestGeneration: gen({ status: "succeeded", finishedAt: new Date().toISOString() }) });
    await advance(5000);

    expect(await screen.findByText("Summary A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toHaveAttribute("aria-disabled", "false");
    expect(screen.getByRole("button", { name: "Regenerate" })).toHaveFocus();
    expect(screen.getByText("Onboarding tour generated")).toBeInTheDocument();
    expect(screen.getAllByRole("status").some((el) => el.getAttribute("aria-busy") === "true")).toBe(false);
  });

  it("SPEC-02 AC-45: when generation fails it announces the failure through the status region and keeps focus on Regenerate", async () => {
    fakeIntervals();
    serve(state({ tour: tour() }));
    renderPage();
    // A real user activation: the button takes focus, then is clicked.
    const trigger = await screen.findByRole("button", { name: "Regenerate" });
    act(() => trigger.focus());
    fireEvent.click(trigger);

    served = state({ tour: tour(), latestGeneration: gen() });
    await advance(5000);
    const regenerate = await screen.findByRole("button", { name: "Regenerate" });
    await waitFor(() => expect(regenerate).toHaveAttribute("aria-disabled", "true"));
    expect(regenerate).toHaveFocus();

    served = state({
      tour: tour(),
      latestGeneration: gen({ status: "failed", reason: "ai_unavailable", finishedAt: new Date().toISOString() }),
    });
    await advance(5000);

    const announcement = await screen.findByText("Onboarding tour generation failed");
    expect(screen.getAllByRole("status").some((el) => el.contains(announcement))).toBe(true);
    expect(screen.getByRole("button", { name: "Regenerate" })).toHaveFocus();
  });

  it("RQ62: opening the page on an existing tour does not move focus to Regenerate", async () => {
    serve(state({ tour: tour() }));
    renderPage();
    const regenerate = await screen.findByRole("button", { name: "Regenerate" });
    expect(await screen.findByText("Summary A")).toBeInTheDocument();
    expect(regenerate).not.toHaveFocus();
  });

  it("RQ62: opening the page on a tour that is already generating does not move focus to Regenerate", async () => {
    serve(state({ tour: tour(), latestGeneration: gen() }));
    renderPage();
    const regenerate = await screen.findByRole("button", { name: "Regenerate" });
    await waitFor(() => expect(regenerate).toHaveAttribute("aria-disabled", "true"));
    expect(regenerate).not.toHaveFocus();
  });

  it("SPEC-02 AC-33: Regenerate on an existing tour posts one generation; while it runs the previous tour stays and Regenerate ignores clicks", async () => {
    serve(state({ tour: tour() }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith(GENERATE);
    cleanup();

    serve(state({ tour: tour(), latestGeneration: gen() }));
    post.mockClear();
    renderPage();
    const regenerate = await screen.findByRole("button", { name: "Regenerate" });
    expect(screen.getByText("Summary A")).toBeInTheDocument();
    expect(regenerate).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/Generating… \d+s/)).toBeInTheDocument();
    fireEvent.click(regenerate);
    expect(post).not.toHaveBeenCalled();
  });

  it("SPEC-02 AC-35: a failed regeneration keeps the previous tour and shows the failure reason in a banner", async () => {
    serve(
      state({
        tour: tour(),
        latestGeneration: gen({ status: "failed", reason: "ai_unavailable", finishedAt: new Date().toISOString() }),
      }),
    );
    renderPage();
    expect(await screen.findByText("Summary A")).toBeInTheDocument();
    expect(screen.getByText(/Regeneration failed.*AI summary unavailable/)).toBeInTheDocument();
  });

  it("SPEC-02 AC-37 / AC-47: a stale index shows 'The index changed since this tour was generated' with Regenerate and Re-analyze, and Re-analyze requests a re-index", async () => {
    serve(state({ tour: tour(), stale: true }));
    renderPage();
    const notice = (await screen.findByText("The index changed since this tour was generated")).parentElement!;
    expect(within(notice).getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
    fireEvent.click(within(notice).getByRole("button", { name: "Re-analyze" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(RESYNC));
  });

  it("SPEC-02 AC-37: a fresh index shows no stale notice", async () => {
    serve(state({ tour: tour(), stale: false }));
    renderPage();
    expect(await screen.findByText("Summary A")).toBeInTheDocument();
    expect(screen.queryByText("The index changed since this tour was generated")).not.toBeInTheDocument();
  });
});

describe("OnboardingTourPage sections", () => {
  it("SPEC-02 AC-8 / AC-10: five sections in order in the generated and the skeleton view; chevrons expose aria-expanded and toggle the body", async () => {
    serve(state({ tour: tour() }));
    renderPage();
    await screen.findByText("Summary A");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(SECTION_TITLES);

    const chevron = screen.getByRole("button", { name: "Toggle Architecture overview" });
    expect(chevron).toHaveAttribute("aria-expanded", "true");
    for (const title of SECTION_TITLES) {
      expect(screen.getByRole("button", { name: `Toggle ${title}` })).toHaveAttribute("aria-expanded", "true");
    }
    fireEvent.click(chevron);
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Summary A")).not.toBeVisible();
    fireEvent.click(chevron);
    expect(chevron).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Summary A")).toBeVisible();
    cleanup();

    serve(state({ skeleton: skeleton(), latestGeneration: gen({ status: "failed", reason: "ai_unavailable", finishedAt: new Date().toISOString() }) }));
    renderPage();
    await screen.findByText("AI summary unavailable");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(SECTION_TITLES);
  });

  it("SPEC-02 AC-57: a skeleton with 25 ranked files shows 8 rows and 'Show all (25)' with facts only", async () => {
    const entries = Array.from({ length: 25 }, (_, i) => entry(i + 1, { importers: 3 }));
    serve(
      state({
        skeleton: skeleton({ criticalPaths: { entries, truncated: true } }),
        latestGeneration: gen({ status: "failed", reason: "ai_unavailable", finishedAt: new Date().toISOString() }),
      }),
    );
    renderPage();
    const region = await screen.findByRole("region", { name: "Critical paths" });
    expect(within(region).getAllByRole("listitem")).toHaveLength(8);
    expect(within(region).getByRole("button", { name: "Show all (25)" })).toBeInTheDocument();
    expect(within(region).getAllByRole("listitem")[0]).toHaveTextContent("imported by 3 files");
  });

  it("SPEC-02 AC-9: the 'ON THIS PAGE' item of the section in view is highlighted and the previous one is not", async () => {
    let callback: IntersectionObserverCallback = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    serve(state({ tour: tour() }));
    renderPage();
    await screen.findByText("Summary A");
    const toc = screen.getByRole("navigation", { name: "On this page" });
    expect(within(toc).getByRole("button", { name: "Architecture overview" })).toHaveAttribute("aria-current", "location");

    const target = document.getElementById("first_tasks")!;
    act(() => {
      callback([{ isIntersecting: true, target } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    expect(within(toc).getByRole("button", { name: "First tasks" })).toHaveAttribute("aria-current", "location");
    expect(within(toc).getByRole("button", { name: "Architecture overview" })).not.toHaveAttribute("aria-current");
  });

  it("SPEC-02 AC-50: activating a TOC item of a collapsed section expands it and scrolls that section into view", async () => {
    serve(state({ tour: tour() }));
    renderPage();
    await screen.findByText("Summary A");
    const chevron = screen.getByRole("button", { name: "Toggle First tasks" });
    fireEvent.click(chevron);
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    scrollIntoView.mockClear();

    const item = within(screen.getByRole("navigation", { name: "On this page" })).getByRole("button", { name: "First tasks" });
    expect(item.tagName).toBe("BUTTON");
    fireEvent.click(item);

    expect(chevron).toHaveAttribute("aria-expanded", "true");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById("first_tasks"));
  });

  it("SPEC-02 AC-48: opening the page with the section-key anchor #critical_paths scrolls to that section, which is expanded at scroll time", async () => {
    window.history.replaceState(null, "", "/repos/r1/onboarding-tour#critical_paths");
    const atScroll: { expanded: string | null }[] = [];
    scrollIntoView.mockImplementation(() => {
      atScroll.push({
        expanded: screen.getByRole("button", { name: "Toggle Critical paths" }).getAttribute("aria-expanded"),
      });
    });
    serve(state({ tour: tour({ criticalPaths: { entries: [entry(1)], truncated: false } }) }));
    renderPage();
    await screen.findByText("Summary A");

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById("critical_paths"));
    expect(atScroll).toEqual([{ expanded: "true" }]);
    expect(screen.getByText("src/file-1.ts")).toBeVisible();
  });

  it("SPEC-02 AC-48: a hash that is not a section key scrolls nowhere", async () => {
    window.history.replaceState(null, "", "/repos/r1/onboarding-tour#nonsense");
    scrollIntoView.mockReset();
    serve(state({ tour: tour() }));
    renderPage();
    await screen.findByText("Summary A");
    await new Promise((r) => setTimeout(r, 50));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("OnboardingTourPage section content", () => {
  it("SPEC-02 AC-24: model Markdown with a <script> and a javascript: link renders no script element and no javascript: href", async () => {
    serve(
      state({
        tour: tour({
          architecture: {
            summary: "Safe text <script>window.pwned = 1</script> and [click me](javascript:alert(1))",
            diagram: null,
            stack: [],
            topLevelDirs: [],
          },
        }),
      }),
    );
    renderPage();
    expect(await screen.findByText(/Safe text/)).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.toLowerCase().startsWith("javascript:"))).toBe(false);
  });

  it("SPEC-02 AC-25: an invalid diagram is omitted while the section text is still shown", async () => {
    mermaid.parse.mockResolvedValue(false);
    serve(
      state({
        tour: tour({
          architecture: { summary: "Summary A", diagram: "flowchart TD\n  A-->", stack: [], topLevelDirs: [] },
        }),
      }),
    );
    renderPage();
    expect(await screen.findByText("Summary A")).toBeInTheDocument();
    await waitFor(() => expect(mermaid.parse).toHaveBeenCalled());
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it("SPEC-02 AC-42: 'Open' links to the GitHub blob at the indexed commit in a new tab with no opener; with no indexed commit it is not rendered", async () => {
    const withEntry = tour({ criticalPaths: { entries: [entry(1, { path: "src/server/app.ts" })], truncated: false } });
    serve(state({ tour: withEntry }));
    renderPage();
    const open = await screen.findByRole("link", { name: "Open" });
    expect(open).toHaveAttribute("href", "https://github.com/acme/payments-api/blob/abc123/src/server/app.ts");
    expect(open).toHaveAttribute("target", "_blank");
    expect(open.getAttribute("rel")).toContain("noopener");
    cleanup();

    serve(state({ tour: { ...withEntry, index: { ...withEntry.index, indexedSha: "" } } }));
    renderPage();
    await screen.findByText("src/server/app.ts");
    expect(screen.queryByRole("link", { name: "Open" })).not.toBeInTheDocument();
  });
});
