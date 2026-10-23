import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextDoc } from "@devdigest/shared";
import context from "../../../../messages/en/context.json";

vi.mock("@/lib/hooks/context", () => ({
  useContextDoc: () => ({
    data: { path: "specs/rate-limits.md", content: "# Rate limits\n\nBurst of 20.", reason: null },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { DocPreviewDrawer } from "./DocPreviewDrawer";

const DOC: ContextDoc = {
  path: "specs/rate-limits.md",
  category: "specs",
  tokens: 178,
  size: 900,
  updated_at: "2026-10-01T00:00:00.000Z",
  previewable: true,
  used_by_agents: 3,
};

afterEach(cleanup);

function renderDrawer(over: { attached?: boolean; onToggle?: (v: boolean) => void } = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={{ context }}>
      <DocPreviewDrawer repoId="r1" doc={DOC} onClose={() => {}} {...over} />
    </NextIntlClientProvider>,
  );
}

describe("DocPreviewDrawer", () => {
  it("SPEC-01 AC-28: shows path, category, 'Used by 3 agents', '≈ 178 tokens', the Attached toggle and the rendered content", () => {
    renderDrawer({ attached: true, onToggle: () => {} });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("specs/rate-limits.md");
    expect(screen.getByLabelText("Category: specs")).toBeInTheDocument();
    expect(screen.getByText("Used by 3 agents")).toBeInTheDocument();
    expect(screen.getByText("≈ 178 tokens")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Attached")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Rate limits" })).toBeInTheDocument();
  });

  it("SPEC-01 AC-28: clicking the Attached toggle of an attached doc detaches it, and of a detached doc attaches it", () => {
    const onToggle = vi.fn();
    renderDrawer({ attached: true, onToggle });
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenLastCalledWith(false);

    cleanup();
    renderDrawer({ attached: false, onToggle });
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenLastCalledWith(true);
  });

  it("SPEC-01 AC-28: without an onToggle (read-only use) there is no Attached toggle", () => {
    renderDrawer();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});
