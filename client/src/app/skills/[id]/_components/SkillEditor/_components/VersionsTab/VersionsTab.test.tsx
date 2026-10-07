import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import skillMessages from "../../../../../../../../messages/en/skills.json";

const mutate = vi.fn();
const success = vi.fn();
let versions: SkillVersion[] = [];
let query = { isLoading: false, isError: false };
let isPending = false;

// Mock the data hooks so the tab renders without a network/query client.
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: query.isLoading || query.isError ? undefined : versions, ...query, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate, isPending }),
}));
vi.mock("../../../../../../../lib/toast", () => ({ useToast: () => ({ success }) }));

import { VersionsTab } from "./VersionsTab";
import { formatVersionDate } from "./helpers";

const SKILL: Skill = {
  id: "sk1",
  name: "uncovered-branches",
  description: "",
  type: "rubric",
  source: "manual",
  body: "# Rule\nkeep\nnew line",
  enabled: true,
  version: 3,
  body_tokens: 8,
};

const version = (n: number, message: string, body: string, current = false): SkillVersion => ({
  version: n,
  message,
  body,
  created_at: `2026-09-0${n}T12:00:00.000Z`,
  current,
});

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillMessages }}>
      <VersionsTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

const rowOf = (label: string) => screen.getByText(label).closest("li")!;

beforeEach(() => {
  mutate.mockReset();
  success.mockClear();
  query = { isLoading: false, isError: false };
  isPending = false;
  // Deliberately oldest-first: the tab sorts newest-first itself.
  versions = [
    version(1, "Initial version", "# Rule\nkeep\nold line"),
    version(2, "Updated body", "# Rule\nkeep"),
    version(3, "Tighten wording", SKILL.body, true),
  ];
});
afterEach(cleanup);

describe("VersionsTab", () => {
  it("lists versions newest first with the count, message and date", () => {
    renderTab();
    expect(screen.getByRole("heading", { name: "Version history" })).toBeInTheDocument();
    expect(screen.getByText("3 versions")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent!.slice(0, 2))).toEqual(["v3", "v2", "v1"]);
    expect(within(rowOf("v2")).getByText("Updated body")).toBeInTheDocument();
    // Formatted in the local time zone, so compare against the helper, not a literal.
    expect(within(rowOf("v2")).getByText(formatVersionDate("2026-09-02T12:00:00.000Z"))).toBeInTheDocument();
  });

  it("marks only the current version, which has no Diff or Restore", () => {
    renderTab();
    expect(screen.getAllByText("Current")).toHaveLength(1);
    const current = within(rowOf("v3"));
    expect(current.getByText("Current")).toBeInTheDocument();
    expect(current.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore v3" })).not.toBeInTheDocument();
    expect(within(rowOf("v1")).queryByText("Current")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore v1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Diff v1 against the current version" })).toBeInTheDocument();
  });

  it("Restore calls the mutation with that version and toasts the new version", () => {
    mutate.mockImplementation((_vars, opts) => {
      opts.onSuccess({ ...SKILL, version: 4 });
      opts.onSettled();
    });
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Restore v2" }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({ id: "sk1", version: 2 });
    expect(success).toHaveBeenCalledWith("Restored v2 as v4");
  });

  it("ignores further Restore clicks while one is in flight", () => {
    // The mutation never settles here.
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Restore v2" }));
    expect(screen.getByRole("button", { name: "Restore v2" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restore v1" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Restore v2" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore v1" }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("Diff opens a modal comparing that version's body with the current body", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Diff v1 against the current version" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("v1 → v3 (current)")).toBeInTheDocument();
    expect(within(dialog).getByText("old line").closest("[data-diff]")).toHaveAttribute("data-diff", "del");
    expect(within(dialog).getByText("new line").closest("[data-diff]")).toHaveAttribute("data-diff", "add");
    expect(within(dialog).getByText("keep").closest("[data-diff]")).toHaveAttribute("data-diff", "same");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows an empty state when the skill has no versions", () => {
    versions = [];
    renderTab();
    expect(screen.getByText("No versions yet")).toBeInTheDocument();
  });

  it("shows an error with Retry when the history fails to load", () => {
    query = { isLoading: false, isError: true };
    renderTab();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the version history.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
