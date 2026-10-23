import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

let current: RunTrace = TRACE;

vi.mock("../../../../../../../lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: current, isLoading: false }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(() => {
  cleanup();
  current = TRACE;
  Reflect.deleteProperty(navigator, "clipboard");
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });
});

describe("Run trace: project context", () => {
  const SPECS_TEXT = "### docs/a.md\n\nsecret rule one\n\n### specs/b.md\n\nsomething else";
  const withSpecs = (over: Partial<RunTrace> = {}): RunTrace => ({
    ...TRACE,
    prompt_assembly: { ...TRACE.prompt_assembly, specs: SPECS_TEXT, specs_tokens: 317 },
    specs_read: ["docs/a.md", "specs/b.md"],
    specs_read_detail: [
      { path: "docs/a.md", tokens: 178 },
      { path: "specs/b.md", tokens: 139 },
    ],
    ...over,
  });
  const openPromptAssembly = () => fireEvent.click(screen.getByText("Prompt assembly"));

  it("SPEC-01 AC-42 / AC-50: Specs read lists the injected paths in order, each with its own token count", () => {
    current = withSpecs();
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    const label = screen.getByText("Specs read");
    const row = label.parentElement!;
    const paths = within(row)
      .getAllByText(/\.md$/)
      .map((el) => el.textContent);
    expect(paths).toEqual(["docs/a.md", "specs/b.md"]);
    expect(within(row).getByText("≈ 178 tokens")).toBeInTheDocument();
    expect(within(row).getByText("≈ 139 tokens")).toBeInTheDocument();
  });

  it("SPEC-01 AC-42: a run that injected nothing shows 'none' for Specs read", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Specs read").parentElement).toHaveTextContent("none");
  });

  it("SPEC-01 AC-43: the Prompt assembly block is labelled 'Project context — attached specs (untrusted)' with '+317 tokens' only when specs were injected", () => {
    current = withSpecs();
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    openPromptAssembly();
    expect(screen.getByText("Project context — attached specs (untrusted)")).toBeInTheDocument();
    expect(screen.getByText("+317 tokens")).toBeInTheDocument();

    cleanup();
    current = TRACE;
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    openPromptAssembly();
    expect(screen.queryByText("Project context — attached specs (untrusted)")).not.toBeInTheDocument();
  });

  it("SPEC-01 AC-44: the fullscreen modal shows the full injected text, a search finds matches and Copy writes the full text to the clipboard", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    current = withSpecs();
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    openPromptAssembly();

    const block = screen.getByText("Project context — attached specs (untrusted)").parentElement!;
    fireEvent.click(within(block).getByRole("button", { name: "Open fullscreen" }));
    // The drawer is itself a dialog; the prompt modal is the one holding the search box.
    const modal = screen.getByPlaceholderText("Search in this block…").closest<HTMLElement>('[role="dialog"]')!;
    expect(modal).toHaveTextContent("secret rule one");
    expect(modal).toHaveTextContent("something else");

    fireEvent.change(within(modal).getByPlaceholderText("Search in this block…"), { target: { value: "SECRET" } });
    expect(modal.querySelector("mark")).toHaveTextContent(/secret/i);
    expect(modal).not.toHaveTextContent("something else");

    fireEvent.click(within(modal).getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(SPECS_TEXT);
  });

  it("SPEC-01 AC-45: injected text and warnings containing HTML are shown as literal text, not elements", () => {
    const html = "<img src=x onerror=alert(1)>";
    current = withSpecs({
      prompt_assembly: { ...TRACE.prompt_assembly, specs: `### docs/a.md\n\n${html}`, specs_tokens: 12 },
      context_warnings: [`Attached document not found: ${html}`],
    });
    const { container } = renderWithIntl(
      <RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />,
    );
    openPromptAssembly();
    const block = screen.getByText("Project context — attached specs (untrusted)").parentElement!.parentElement!;
    fireEvent.click(within(block).getByText("expand"));
    expect(screen.getByText(/^### docs\/a\.md/)).toHaveTextContent(html);
    expect(screen.getByText(`Attached document not found: ${html}`)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("SPEC-01 AC-36: context warnings are listed in the Configuration section", () => {
    current = withSpecs({ context_warnings: ["Attached document not found: docs/gone.md"] });
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Context warnings")).toBeInTheDocument();
    expect(screen.getByText("Attached document not found: docs/gone.md")).toBeInTheDocument();
  });
});
