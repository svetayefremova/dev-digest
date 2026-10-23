import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingRankedEntry, OnboardingRankedList } from "@devdigest/shared";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import { RankedList } from "./RankedList";

afterEach(cleanup);

const entry = (i: number, over: Partial<OnboardingRankedEntry> = {}): OnboardingRankedEntry => ({
  path: `src/file-${i}.ts`,
  rank: 1 / (i + 1),
  importers: 0,
  endpoints: 0,
  reason: null,
  ...over,
});
const entries = (n: number) => Array.from({ length: n }, (_, i) => entry(i + 1));
const list = (n: number, truncated = false): OnboardingRankedList => ({ entries: entries(n), truncated });

function renderList(l: OnboardingRankedList, filesIndexed = 4800) {
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <RankedList list={l} repoFullName="acme/payments-api" indexedSha="abc123" filesIndexed={filesIndexed} />
    </NextIntlClientProvider>,
  );
}

describe("RankedList", () => {
  it("SPEC-02 AC-53 / AC-54: 20 entries show 8 rows and 'Show all (20)'; it expands to 20 as 'Show less' and collapses back to 8", () => {
    renderList(list(20));
    expect(screen.getAllByRole("listitem")).toHaveLength(8);

    fireEvent.click(screen.getByRole("button", { name: "Show all (20)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    expect(screen.queryByRole("button", { name: "Show all (20)" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Show all (20)" })).toBeInTheDocument();
  });

  it("SPEC-02 AC-55: exactly 8 entries show all 8 rows and no Show all / Show less control", () => {
    renderList(list(8));
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("SPEC-02 AC-58: an expanded list cut off at 25 ends with 'Top 25 of 4,800 indexed files by import rank'", () => {
    renderList(list(25, true));
    fireEvent.click(screen.getByRole("button", { name: "Show all (25)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(25);
    expect(screen.getByText("Top 25 of 4,800 indexed files by import rank")).toBeInTheDocument();
  });

  it("SPEC-02 AC-58: no truncation note for exactly 25 entries that were not cut off, nor for 18 entries", () => {
    renderList(list(25, false));
    fireEvent.click(screen.getByRole("button", { name: "Show all (25)" }));
    expect(screen.queryByText(/Top 25 of/)).not.toBeInTheDocument();
    cleanup();

    renderList(list(18, false));
    fireEvent.click(screen.getByRole("button", { name: "Show all (18)" }));
    expect(screen.queryByText(/Top 25 of/)).not.toBeInTheDocument();
  });

  it("SPEC-02 AC-16 / AC-56: a row shows the index fact 'imported by 14 files' and, for an entry with no model reason, only that fact", () => {
    renderList({
      entries: [
        entry(1, { importers: 14, reason: "Application entry point" }),
        entry(2, { importers: 9, reason: null }),
      ],
      truncated: false,
    });
    const [first, second] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("Application entry point");
    expect(first).toHaveTextContent("imported by 14 files");
    expect(second).toHaveTextContent("imported by 9 files");
    expect(second).not.toHaveTextContent("—");
  });
});
