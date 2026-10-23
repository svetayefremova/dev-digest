import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BlastRadiusResponse } from "@devdigest/shared";
import blast from "../../../../../../../../messages/en/blast.json";

let blastState: { data?: BlastRadiusResponse; isLoading: boolean; isError: boolean };
const mutate = vi.fn();

vi.mock("@/lib/hooks/blast", () => ({
  useBlastRadius: () => blastState,
}));
vi.mock("@/lib/hooks/repo-intel", () => ({
  useRepoIntelStatus: () => ({ data: { updatedAt: "2026-10-01T00:00:00.000Z" } }),
  useResyncRepoIntel: () => ({ mutate, isPending: false }),
}));

import { BlastRadiusCard } from "./BlastRadius";

const sym = (name: string) => ({ name, file: "src/x.ts", kind: "function" });

const base: BlastRadiusResponse = {
  changed_symbols: [sym("charge"), sym("refund")],
  downstream: [
    {
      symbol: "charge",
      callers: [
        { name: "pay", file: "src/pay.ts", line: 10 },
        { name: "retry", file: "src/retry.ts", line: 4 },
      ],
      endpoints_affected: ["POST /pay"],
      crons_affected: ["nightly-settle"],
    },
  ],
  summary: "2 symbols · 2 callers · 1 endpoints · 1 crons",
  degraded: false,
  reason: null,
};

function renderCard(repoFullName: string | null = "acme/payments") {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast }}>
        <BlastRadiusCard prId="pr1" repoId="r1" repoFullName={repoFullName} headSha="abc123" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mutate.mockReset();
  blastState = { data: base, isLoading: false, isError: false };
});
afterEach(cleanup);

describe("BlastRadiusCard", () => {
  it("T5: tree shows stats, the symbol with its caller count, GitHub file:line links and endpoint/cron chips", () => {
    renderCard();
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(screen.getByText("charge()")).toBeInTheDocument();
    expect(screen.getByText("2 callers", { selector: "span" })).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "src/pay.ts:10" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/payments/blob/abc123/src/pay.ts#L10");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.getByRole("link", { name: "src/retry.ts:4" })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments/blob/abc123/src/retry.ts#L4",
    );

    expect(screen.getByLabelText("Endpoint affected: POST /pay")).toBeInTheDocument();
    expect(screen.getByLabelText("Cron/job affected: nightly-settle")).toBeInTheDocument();
  });

  it("T5: renders caller locations as plain text when the repo full name is unknown", () => {
    renderCard(null);
    expect(screen.getByText("src/pay.ts:10")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("T5: shows the noDownstream copy with the changed-symbol count when no callers exist", () => {
    blastState = { data: { ...base, downstream: [] }, isLoading: false, isError: false };
    renderCard();
    expect(screen.getByText("2 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("T5: shows the noSymbols copy when the changed files have no indexed symbols", () => {
    blastState = { data: { ...base, changed_symbols: [], downstream: [] }, isLoading: false, isError: false };
    renderCard();
    expect(screen.getByText("No indexed symbols in the changed files.")).toBeInTheDocument();
  });

  it("T5: shows the error copy when the request failed", () => {
    blastState = { data: undefined, isLoading: false, isError: true };
    renderCard();
    expect(screen.getByText("Couldn't load the blast radius.")).toBeInTheDocument();
  });

  it("T5: a degraded response shows the notice together with the data, and Rebuild index triggers the resync POST", () => {
    blastState = {
      data: { ...base, degraded: true, reason: "index_partial" },
      isLoading: false,
      isError: false,
    };
    renderCard();
    expect(screen.getByRole("status")).toHaveTextContent("Repository index is incomplete — callers may be missing.");
    expect(screen.getByRole("link", { name: "src/pay.ts:10" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Rebuild index/ }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("T5 F1: a no_changed_files response shows the reopen-the-PR notice and no Rebuild index button", () => {
    blastState = {
      data: { ...base, changed_symbols: [], downstream: [], degraded: true, reason: "no_changed_files" },
      isLoading: false,
      isError: false,
    };
    renderCard();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Changed files for this PR aren't loaded yet — reopen the PR to sync them from GitHub.",
    );
    expect(screen.queryByRole("button", { name: /Rebuild index/ })).not.toBeInTheDocument();
  });

  it("T5 F1: other degraded reasons (no_data) still show the Rebuild index button", () => {
    blastState = { data: { ...base, degraded: true, reason: "no_data" }, isLoading: false, isError: false };
    renderCard();
    expect(screen.getByRole("status")).toHaveTextContent("Repository index has no data for this repo");
    expect(screen.getByRole("button", { name: /Rebuild index/ })).toBeInTheDocument();
  });

  it("T5: no degraded notice when the response is not degraded", () => {
    renderCard();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rebuild index/ })).not.toBeInTheDocument();
  });

  it("T5: the Graph toggle swaps the tree for the SVG graph", () => {
    renderCard();
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "graph" }));
    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "src/pay.ts:10" })).not.toBeInTheDocument();
  });
});
