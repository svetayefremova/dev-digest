import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/agents.json";
import { AgentsEmptyView } from "./AgentsEmptyView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateAgent: () => ({ mutate: vi.fn() }),
  useDeleteAgent: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

afterEach(cleanup);

const renderView = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <AgentsEmptyView />
    </NextIntlClientProvider>,
  );

// The create dialog's own submit button; absent until the dialog is open.
const dialogSubmit = () => screen.queryByRole("button", { name: "Create agent" });

describe("AgentsEmptyView", () => {
  it("explains what an agent is and offers both ways to create one", () => {
    renderView();
    expect(screen.getByText("No agents yet")).toBeInTheDocument();
    expect(screen.getByText(/An agent is a configured reviewer/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create your first agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start from template" })).toBeInTheDocument();
    expect(dialogSubmit()).not.toBeInTheDocument();
  });

  it("'Create your first agent' opens the create dialog", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Create your first agent" }));
    expect(dialogSubmit()).toBeInTheDocument();
  });

  it("picking a template opens the create dialog", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Start from template" }));
    fireEvent.click(screen.getByText("Security"));
    expect(dialogSubmit()).toBeInTheDocument();
  });
});
