import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  category: "structure",
  rule: "Redis access goes through the singleton.",
  evidence_path: "src/lib/redis.ts",
  evidence_line: 1,
  evidence_end_line: 9,
  evidence_snippet: "export const redis = new Redis(config.redisUrl);",
  confidence: 0.85,
  status: "pending",
};

function renderCard(candidate: ConventionCandidate = CANDIDATE) {
  const handlers = { onAccept: vi.fn(), onReject: vi.fn(), onSave: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard candidate={candidate} {...handlers} />
    </NextIntlClientProvider>,
  );
  return handlers;
}

describe("ConventionCard", () => {
  it("shows the rule, its source, the snippet and the confidence", () => {
    renderCard();
    expect(screen.getByText("Redis access goes through the singleton.")).toBeInTheDocument();
    expect(screen.getByText("src/lib/redis.ts:1-9")).toBeInTheDocument();
    expect(screen.getByText("export const redis = new Redis(config.redisUrl);")).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.getByText("structure")).toBeInTheDocument();
  });

  it("has Accept, Reject and Edit; Accept toggles and Reject rejects", () => {
    const { onAccept, onReject } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAccept).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReject).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("an accepted card reads Accepted and un-accepts on click", () => {
    const { onAccept } = renderCard({ ...CANDIDATE, status: "accepted" });
    const button = screen.getByRole("button", { name: "Accepted" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(onAccept).toHaveBeenCalledWith(false);
  });

  it("Edit turns the rule into an inline form and Save sends the edit", () => {
    const { onSave } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const input = screen.getByDisplayValue("Redis access goes through the singleton.");
    fireEvent.change(input, { target: { value: "  Use the redis singleton.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ rule: "Use the redis singleton.", category: "structure" });
    // Back to the read view.
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("Cancel leaves the rule unchanged and saves nothing", () => {
    const { onSave } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByDisplayValue(CANDIDATE.rule), { target: { value: "Something else" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });
});
