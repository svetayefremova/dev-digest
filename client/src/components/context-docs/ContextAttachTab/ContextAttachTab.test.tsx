import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextAttachment, ContextDoc } from "@devdigest/shared";
import context from "../../../../messages/en/context.json";

let docs: ContextDoc[] = [];

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/payments-api" } }),
}));
vi.mock("@/lib/hooks/context", () => ({
  useContextDocs: () => ({
    data: { cloned: true, docs, truncated: false, total_tokens: 0, scanned_at: "2026-10-01T00:00:00.000Z" },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useContextDoc: () => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() }),
}));

import { ContextAttachTab } from "./ContextAttachTab";

const doc = (path: string, tokens = 10): ContextDoc => ({
  path,
  category: "docs",
  tokens,
  size: 100,
  updated_at: "2026-10-01T00:00:00.000Z",
  previewable: true,
  used_by_agents: 0,
});

const att = (path: string, order: number): ContextAttachment => ({ path, order });

function renderTab(attachments: ContextAttachment[], onSave: (paths: string[]) => Promise<unknown>) {
  render(
    <NextIntlClientProvider locale="en" messages={{ context }}>
      <ContextAttachTab attachments={attachments} onSave={onSave} title="Context" note="note" />
    </NextIntlClientProvider>,
  );
}

/** Checkbox state per row in reading order: "<path>:on|off". */
const rowState = () =>
  screen
    .getAllByRole("checkbox")
    .map((box) => `${box.closest("label")!.textContent!.replace(/^Attach /, "")}:${box.getAttribute("aria-checked") === "true" ? "on" : "off"}`);

const save = () => vi.fn<(paths: string[]) => Promise<unknown>>().mockResolvedValue(undefined);

beforeEach(() => {
  docs = [
    doc("docs/alpha.md"),
    doc("docs/beta.md"),
    doc("docs/rate-limits.md"),
    doc("insights/gamma.md"),
    doc("specs/auth.md"),
    doc("specs/delta.md"),
    doc("specs/rate.md"),
  ];
});
afterEach(cleanup);

describe("ContextAttachTab", () => {
  it("SPEC-01 AC-21 / AC-22: lists attached docs first in saved order (checked) and the header pill reads '2 attached'", () => {
    renderTab([att("specs/auth.md", 1), att("docs/beta.md", 0)], save());
    expect(rowState()).toEqual([
      "docs/beta.md:on",
      "specs/auth.md:on",
      "docs/alpha.md:off",
      "docs/rate-limits.md:off",
      "insights/gamma.md:off",
      "specs/delta.md:off",
      "specs/rate.md:off",
    ]);
    expect(screen.getByText("2 attached")).toBeInTheDocument();
    expect(screen.queryByText(/of 7/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Preview / })).toHaveLength(7);
    expect(screen.getAllByLabelText(/^Category: /)).toHaveLength(7);
  });

  it("SPEC-01 AC-22: ticking a doc saves the full ordered list with it appended and the pill becomes '3 attached'", () => {
    const onSave = vi.fn<(paths: string[]) => Promise<unknown>>().mockReturnValue(new Promise(() => {}));
    renderTab([att("docs/beta.md", 0), att("specs/auth.md", 1)], onSave);
    fireEvent.click(screen.getByRole("checkbox", { name: "Attach specs/delta.md" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(["docs/beta.md", "specs/auth.md", "specs/delta.md"]);
    expect(screen.getByText("3 attached")).toBeInTheDocument();
  });

  it("SPEC-01 AC-22: unticking an attached doc saves the list without it", () => {
    const onSave = save();
    renderTab([att("docs/beta.md", 0), att("specs/auth.md", 1)], onSave);
    fireEvent.click(screen.getByRole("checkbox", { name: "Attach docs/beta.md" }));
    expect(onSave).toHaveBeenCalledWith(["specs/auth.md"]);
  });

  it("SPEC-01 AC-25: filtering by 'RATE' shows only matching paths, keeps their checked state and saves nothing", () => {
    const onSave = save();
    renderTab([att("specs/rate.md", 0)], onSave);
    fireEvent.change(screen.getByRole("textbox", { name: "Filter documents…" }), { target: { value: "RATE" } });
    expect(rowState()).toEqual(["specs/rate.md:on", "docs/rate-limits.md:off"]);
    expect(screen.getByText("1 attached")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("SPEC-01 AC-23: dragging the second attached doc onto the first saves the swapped order", () => {
    const onSave = save();
    renderTab([att("docs/beta.md", 0), att("specs/auth.md", 1)], onSave);
    const items = screen.getAllByRole("listitem");
    const dataTransfer = { effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(items[1]!, { dataTransfer });
    fireEvent.dragOver(items[0]!, { dataTransfer });
    fireEvent.drop(items[0]!, { dataTransfer });
    expect(onSave).toHaveBeenCalledWith(["specs/auth.md", "docs/beta.md"]);
  });

  it("SPEC-01 AC-24: ArrowUp on a row's move handle saves the swapped order and announces the new position", async () => {
    const onSave = save();
    renderTab([att("docs/beta.md", 0), att("specs/auth.md", 1)], onSave);
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder specs/auth.md (use arrow keys)" }), { key: "ArrowUp" });
    expect(onSave).toHaveBeenCalledWith(["specs/auth.md", "docs/beta.md"]);
    const live = document.querySelector('[aria-live="polite"]')!;
    expect(live).toHaveTextContent("specs/auth.md moved to position 1 of 2");
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it("SPEC-01 AC-24: ArrowUp on the first attached doc does nothing", () => {
    const onSave = save();
    renderTab([att("docs/beta.md", 0), att("specs/auth.md", 1)], onSave);
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder docs/beta.md (use arrow keys)" }), { key: "ArrowUp" });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("SPEC-01 AC-31: an attached path missing from the checkout shows 'File missing' and Detach saves the list without it", () => {
    const onSave = save();
    renderTab([att("docs/beta.md", 0), att("docs/gone.md", 1)], onSave);
    const row = screen.getByRole("checkbox", { name: "Attach docs/gone.md" }).closest("li")!;
    expect(within(row).getByText("File missing")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /^Preview / })).not.toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Detach" }));
    expect(onSave).toHaveBeenCalledWith(["docs/beta.md"]);
  });

  it("SPEC-01 AC-32: when saving fails the checkbox reverts and an error message is shown", async () => {
    const onSave = vi.fn<(paths: string[]) => Promise<unknown>>().mockRejectedValue(new Error("500"));
    renderTab([att("docs/beta.md", 0)], onSave);
    fireEvent.click(screen.getByRole("checkbox", { name: "Attach docs/alpha.md" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn.t save the attachments/);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Attach docs/alpha.md" })).toHaveAttribute("aria-checked", "false"));
    expect(screen.getByText("1 attached")).toBeInTheDocument();
  });

  it("SPEC-01 AC-32: a failed reorder restores the previous order", async () => {
    const onSave = vi.fn<(paths: string[]) => Promise<unknown>>().mockRejectedValue(new Error("500"));
    renderTab([att("docs/beta.md", 0), att("specs/auth.md", 1)], onSave);
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder specs/auth.md (use arrow keys)" }), { key: "ArrowUp" });
    await screen.findByRole("alert");
    await waitFor(() => expect(rowState().slice(0, 2)).toEqual(["docs/beta.md:on", "specs/auth.md:on"]));
  });
});
