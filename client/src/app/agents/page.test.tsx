import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../messages/en/agents.json";
import AgentsPage from "./page";

const replace = vi.fn();
const push = vi.fn();
let query: { data?: Agent[]; isLoading: boolean; isError: boolean };

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
vi.mock("../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../lib/hooks/agents", () => ({
  useAgents: () => ({ ...query, refetch: vi.fn() }),
  useUpdateAgent: () => ({ mutate: vi.fn() }),
  useDeleteAgent: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const AGENT: Agent = {
  id: "a",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "Review.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

const renderPage = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <AgentsPage />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  query = { data: [AGENT], isLoading: false, isError: false };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/agents page", () => {
  it("with agents, lists them and prompts to select one — without opening any", () => {
    renderPage();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Select an agent")).toBeInTheDocument();
    expect(screen.queryByText("No agents yet")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("with no agents, shows the 'No agents yet' view and its create actions", () => {
    query = { data: [], isLoading: false, isError: false };
    renderPage();
    expect(screen.getByText("No agents yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create your first agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start from template" })).toBeInTheDocument();
    expect(screen.queryByText("Select an agent")).not.toBeInTheDocument();
  });

  it("while loading, shows neither the select prompt nor the empty view", () => {
    query = { data: undefined, isLoading: true, isError: false };
    renderPage();
    expect(screen.queryByText("Select an agent")).not.toBeInTheDocument();
    expect(screen.queryByText("No agents yet")).not.toBeInTheDocument();
  });

  it("on a load error, shows the error in the list and no prompt or empty view", () => {
    query = { data: undefined, isLoading: false, isError: true };
    renderPage();
    expect(screen.getByText("Could not load agents.")).toBeInTheDocument();
    expect(screen.queryByText("Select an agent")).not.toBeInTheDocument();
    expect(screen.queryByText("No agents yet")).not.toBeInTheDocument();
  });
});
