import { describe, it, expect } from "vitest";
import type { ContextAttachment, ContextDoc } from "@devdigest/shared";
import { attachedTokens, buildAttachRows, filterDocs, formatTokenTotal, moveRow } from "./helpers";

const doc = (path: string, tokens: number | null = 10): ContextDoc => ({
  path,
  category: "docs",
  tokens,
  size: 100,
  updated_at: "2026-10-01T00:00:00.000Z",
  previewable: tokens !== null,
  used_by_agents: 0,
});

describe("context-docs helpers", () => {
  it("SPEC-01 AC-14: totals below 1,000 are plain integers and from 1,000 up use lowercase k with one decimal", () => {
    expect(formatTokenTotal(4230)).toBe("4.2k");
    expect(formatTokenTotal(850)).toBe("850");
    expect(formatTokenTotal(999)).toBe("999");
    expect(formatTokenTotal(1000)).toBe("1.0k");
  });

  it("SPEC-01 AC-25: filter matches the path substring case-insensitively and an empty query keeps every doc", () => {
    const docs = [doc("docs/Rate-Limits.md"), doc("specs/auth.md"), doc("docs/ops/rate.md")];
    expect(filterDocs(docs, "RATE").map((d) => d.path)).toEqual(["docs/Rate-Limits.md", "docs/ops/rate.md"]);
    expect(filterDocs(docs, "")).toHaveLength(3);
    expect(filterDocs(docs, "zzz")).toEqual([]);
  });

  it("SPEC-01 AC-21 / AC-31: attached rows come first in saved order (a path missing from the checkout is flagged), then unattached by path", () => {
    const docs = [doc("a.md"), doc("b.md"), doc("c.md"), doc("d.md")];
    const attachments: ContextAttachment[] = [
      { path: "d.md", order: 1 },
      { path: "gone.md", order: 0 },
    ];
    const rows = buildAttachRows(docs, attachments);
    expect(rows.map((r) => r.path)).toEqual(["gone.md", "d.md", "a.md", "b.md", "c.md"]);
    expect(rows.map((r) => r.attached)).toEqual([true, true, false, false, false]);
    expect(rows[0]!.missing).toBe(true);
    expect(rows[1]!.missing).toBe(false);
  });

  it("SPEC-01 AC-26: the attached token sum counts only attached rows and ignores missing ones", () => {
    const docs = [doc("a.md", 178), doc("b.md", 139), doc("c.md", 50)];
    const rows = buildAttachRows(docs, [
      { path: "a.md", order: 0 },
      { path: "b.md", order: 1 },
      { path: "gone.md", order: 2 },
    ]);
    expect(attachedTokens(rows)).toBe(317);
  });

  it("SPEC-01 AC-23: moveRow puts the dragged row at the target's position", () => {
    const rows = buildAttachRows([doc("a.md"), doc("b.md"), doc("c.md")], [
      { path: "a.md", order: 0 },
      { path: "b.md", order: 1 },
      { path: "c.md", order: 2 },
    ]);
    expect(moveRow(rows, "c.md", "a.md").map((r) => r.path)).toEqual(["c.md", "a.md", "b.md"]);
    expect(moveRow(rows, "a.md", "a.md")).toBe(rows);
  });
});
