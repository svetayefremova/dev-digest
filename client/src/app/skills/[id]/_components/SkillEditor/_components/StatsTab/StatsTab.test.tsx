import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillStats } from "@devdigest/shared";
import skillMessages from "../../../../../../../../messages/en/skills.json";

let stats: SkillStats;
let query = { isLoading: false, isError: false };

// Mock the data hook so the tab renders without a network/query client.
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillStats: () => ({ data: query.isLoading || query.isError ? undefined : stats, ...query, refetch: vi.fn() }),
}));

import { StatsTab } from "./StatsTab";
import { categoryRows, hasRunData } from "./helpers";

const SKILL = { id: "sk1", name: "uncovered-branches" } as Skill;

const NO_RUNS: SkillStats = {
  used_by: 0,
  pull_pct: null,
  accept_pct: null,
  findings_30d: 0,
  agents: [],
  by_category: [],
};

const WITH_RUNS: SkillStats = {
  used_by: 2,
  pull_pct: 40,
  accept_pct: 75,
  findings_30d: 12,
  agents: [
    { id: "ag1", name: "Test Quality Reviewer" },
    { id: "ag2", name: "Security Reviewer" },
  ],
  by_category: [
    { category: "test", count: 7 },
    { category: "bug", count: 5 },
  ],
};

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillMessages }}>
      <StatsTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

const tile = (name: string) => within(screen.getByRole("group", { name }));

beforeEach(() => {
  query = { isLoading: false, isError: false };
  stats = WITH_RUNS;
});
afterEach(cleanup);

describe("StatsTab", () => {
  it("shows the four tiles with their values", () => {
    renderTab();
    expect(screen.getByRole("group", { name: "Used by" })).toHaveTextContent("2 agents");
    expect(screen.getByRole("group", { name: "Pull frequency" })).toHaveTextContent("40%");
    // The ring is decorative (aria-hidden); the readable value sits beside it.
    expect(tile("Accept rate").getByText("75", { ignore: "[aria-hidden] *" })).toBeInTheDocument();
    expect(tile("Accept rate").getByText("%")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Findings (30d)" })).toHaveTextContent("12");
  });

  it("links each agent to its Skills tab", () => {
    renderTab();
    expect(screen.getByRole("heading", { name: "Agents using this skill" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Test Quality Reviewer" })).toHaveAttribute(
      "href",
      "/agents/ag1?tab=skills",
    );
    expect(screen.getByRole("link", { name: "Open Security Reviewer" })).toHaveAttribute(
      "href",
      "/agents/ag2?tab=skills",
    );
  });

  it("lists finding COUNTS per category (no money) and states the attribution limit", () => {
    renderTab();
    const legend = within(screen.getByRole("list", { name: "Findings by category" }));
    const rows = legend.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows).toEqual(["bug5", "security0", "perf0", "style0", "test7"]);
    expect(screen.getByText(/A finding belongs to a run, not to a skill/)).toBeInTheDocument();
    expect(screen.getByText(/last 30 days/)).toBeInTheDocument();
  });

  it("with no run data and no linked agent shows only the empty state", () => {
    stats = NO_RUNS;
    renderTab();
    expect(screen.getByText("No run data yet")).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.queryByText("Agents using this skill")).not.toBeInTheDocument();
    expect(screen.queryByText("Findings by category")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("with no run data but a linked agent keeps Used by and the agents list", () => {
    stats = { ...NO_RUNS, used_by: 1, agents: [{ id: "ag1", name: "Test Quality Reviewer" }] };
    renderTab();
    expect(screen.getByText("No run data yet")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Used by" })).toHaveTextContent("1 agent");
    expect(screen.getByRole("link", { name: "Open Test Quality Reviewer" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Pull frequency" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Accept rate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Findings (30d)" })).not.toBeInTheDocument();
  });

  it("shows a dash, not 0%, for a percentage that could not be computed", () => {
    // Runs happened and produced findings, but none was accepted or dismissed yet.
    stats = { ...WITH_RUNS, accept_pct: null };
    renderTab();
    expect(screen.getByRole("group", { name: "Accept rate" })).toHaveTextContent(/—$/);
    expect(screen.getByRole("group", { name: "Pull frequency" })).toHaveTextContent("40%");
  });

  it("shows an error with Retry when stats fail to load", () => {
    query = { isLoading: false, isError: true };
    renderTab();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load stats for this skill.");
  });
});

describe("StatsTab helpers", () => {
  it("hasRunData is false only when both percentages are null and there are no findings", () => {
    expect(hasRunData(NO_RUNS)).toBe(false);
    expect(hasRunData({ ...NO_RUNS, used_by: 3 })).toBe(false);
    expect(hasRunData({ ...NO_RUNS, pull_pct: 0 })).toBe(true);
    expect(hasRunData({ ...NO_RUNS, findings_30d: 1 })).toBe(true);
  });

  it("categoryRows keeps the fixed order, fills zeros and appends unknown categories", () => {
    const rows = categoryRows([
      { category: "docs", count: 2 },
      { category: "perf", count: 4 },
    ]);
    expect(rows.map((r) => [r.category, r.count, r.known])).toEqual([
      ["bug", 0, true],
      ["security", 0, true],
      ["perf", 4, true],
      ["style", 0, true],
      ["test", 0, true],
      ["docs", 2, false],
    ]);
  });
});
