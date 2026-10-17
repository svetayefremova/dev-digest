import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/intent.json";
import { IntentCard } from "./IntentCard";

vi.mock("../../../../../../../lib/hooks/intent", () => ({
  usePrIntent: () => ({
    isLoading: false,
    isError: false,
    data: {
      summary: "Add rate limiting to public API endpoints.",
      in_scope: ["Add middleware for rate limiting", "Return 429 with Retry-After"],
      out_of_scope: ["Authentication changes"],
      confidence: "high",
      missing_context: [],
      stale: false,
      sources: [{ kind: "description", ref: "PR description", status: "used", chars: 120 }],
    },
  }),
  useRedetectIntent: () => ({ isPending: false, isError: false, mutate: vi.fn() }),
}));

afterEach(cleanup);

describe("IntentCard", () => {
  it("renders the quoted summary and both scope columns", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ intent: messages }}>
        <IntentCard prId="p1" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("“Add rate limiting to public API endpoints.”")).toBeInTheDocument();
    const inCol = screen.getByText("In scope").parentElement!;
    expect(within(inCol).getByText("Return 429 with Retry-After")).toBeInTheDocument();
    const outCol = screen.getByText("Out of scope").parentElement!;
    expect(within(outCol).getByText("Authentication changes")).toBeInTheDocument();
    expect(screen.getByText("high confidence")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Re-detect/ })).toBeInTheDocument();
  });
});
