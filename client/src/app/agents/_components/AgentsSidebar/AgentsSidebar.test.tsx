import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";
import { AgentsSidebar } from "./AgentsSidebar";

const push = vi.fn();
const mutate = vi.fn();
let agents: Agent[] = [];

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: agents, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateAgent: () => ({ mutate }),
  useDeleteAgent: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const agent = (id: string, name: string, extra: Partial<Agent> = {}): Agent => ({
  id,
  name,
  description: `${name} description`,
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "Review.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
  ...extra,
});

const renderSidebar = (props: { activeId?: string; tab?: string } = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <AgentsSidebar {...props} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  agents = [agent("a", "Security Reviewer"), agent("b", "Performance Reviewer")];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AgentsSidebar", () => {
  it("lists the agents with the add button and search", () => {
    renderSidebar();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Performance Reviewer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Agent" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search agents…" })).toBeInTheDocument();
  });

  it("search filters the list and says so when nothing matches", () => {
    renderSidebar();
    const search = screen.getByRole("textbox", { name: "Search agents…" });
    fireEvent.change(search, { target: { value: "perf" } });
    expect(screen.queryByText("Security Reviewer")).not.toBeInTheDocument();
    expect(screen.getByText("Performance Reviewer")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText("No matching agents")).toBeInTheDocument();
  });

  it("opening another agent keeps the tab that is open", () => {
    renderSidebar({ activeId: "a", tab: "skills" });
    fireEvent.click(screen.getByText("Performance Reviewer"));
    expect(push).toHaveBeenCalledWith("/agents/b?tab=skills");
  });

  it("the card switch saves the enabled flag without opening the agent", () => {
    renderSidebar();
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    expect(mutate).toHaveBeenCalledWith({ id: "a", patch: { enabled: false } });
    expect(push).not.toHaveBeenCalled();
  });

  it("with no agents, shows only the heading", () => {
    agents = [];
    renderSidebar();
    expect(screen.getByRole("heading", { name: "Agents" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Agent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
