import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, ContextAttachment, ContextDoc } from "@devdigest/shared";
import context from "../../../../../../../../messages/en/context.json";

let attachments: ContextAttachment[] = [];
const mutateAsync = vi.fn();

const doc = (path: string, tokens: number): ContextDoc => ({
  path,
  category: "specs",
  tokens,
  size: 100,
  updated_at: "2026-10-01T00:00:00.000Z",
  previewable: true,
  used_by_agents: 1,
});
const DOCS = [doc("specs/a.md", 178), doc("specs/b.md", 139), doc("specs/c.md", 50)];

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/payments-api" } }),
}));
vi.mock("@/lib/hooks/context", () => ({
  useAgentContext: () => ({ data: attachments, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetAgentContext: () => ({ mutateAsync }),
  useContextDocs: () => ({
    data: { cloned: true, docs: DOCS, truncated: false, total_tokens: 367, scanned_at: "2026-10-01T00:00:00.000Z" },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useContextDoc: () => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() }),
}));

import { AgentContextTab } from "./AgentContextTab";

const AGENT = { id: "ag1", name: "Security" } as Agent;

beforeEach(() => {
  attachments = [
    { path: "specs/a.md", order: 0 },
    { path: "specs/b.md", order: 1 },
  ];
  // Never settles, so the optimistic state stays on screen for the assertions.
  mutateAsync.mockReset().mockReturnValue(new Promise(() => {}));
});
afterEach(cleanup);

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ context }}>
      <AgentContextTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

describe("AgentContextTab", () => {
  it("SPEC-01 AC-26: shows the token sum of the agent's attached docs and updates it on every toggle", () => {
    renderTab();
    expect(screen.getByText("≈ 317 tokens")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Attach specs/b.md" }));
    expect(mutateAsync).toHaveBeenLastCalledWith(["specs/a.md"]);
    expect(screen.getByText("≈ 178 tokens")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Attach specs/c.md" }));
    expect(mutateAsync).toHaveBeenLastCalledWith(["specs/a.md", "specs/c.md"]);
    expect(screen.getByText("≈ 228 tokens")).toBeInTheDocument();
  });

  it("SPEC-01 AC-27: states that attached docs are injected as an untrusted '## Project context' block into every run and that order matters", () => {
    renderTab();
    expect(screen.getByText(/Injected as an untrusted block \(## Project context\) into every run/)).toBeInTheDocument();
    expect(screen.getByText(/Order matters/)).toBeInTheDocument();
  });

  it("SPEC-01 AC-53: the agent editor tab keeps the heading 'Project Context', not the skill section label", () => {
    renderTab();
    expect(screen.getByRole("heading", { name: "Project Context" })).toBeInTheDocument();
    expect(screen.queryByText("Project context to use")).not.toBeInTheDocument();
  });
});
