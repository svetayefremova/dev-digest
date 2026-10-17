import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import { findingsByPath, toViewerGroups } from "./helpers";

function finding(id: string, file: string): FindingRecord {
  return { id, file, title: id } as unknown as FindingRecord;
}

function review(agent: string | null, created: string, findings: FindingRecord[]): ReviewRecord {
  return { id: `${agent}-${created}`, agent_id: agent, created_at: created, findings } as unknown as ReviewRecord;
}

describe("DiffTab helpers", () => {
  it("keeps only the latest review per agent when mapping findings", () => {
    const byPath = findingsByPath([
      review("A", "2026-01-01T00:00:00Z", [finding("a-old", "src/a.ts")]),
      review("A", "2026-02-01T00:00:00Z", [finding("a-new", "src/a.ts")]),
      review("B", "2026-01-15T00:00:00Z", [finding("b", "src/b.ts")]),
    ]);
    expect(byPath.get("src/a.ts")?.map((f) => f.id)).toEqual(["a-new"]);
    expect(byPath.get("src/b.ts")?.map((f) => f.id)).toEqual(["b"]);
  });

  it("maps server groups onto PrFiles, adds unlisted files to core, counts files with findings", () => {
    const files: PrFile[] = [
      { path: "src/a.ts", additions: 1, deletions: 0, patch: "PATCH-A" },
      { path: "README.md", additions: 1, deletions: 0, patch: "PATCH-R" },
      { path: "src/new.ts", additions: 1, deletions: 0, patch: "PATCH-N" },
    ];
    const smart: SmartDiff = {
      groups: [
        { role: "core", files: [{ path: "src/a.ts", additions: 1, deletions: 0, finding_lines: [] }] },
        { role: "docs", files: [{ path: "README.md", additions: 1, deletions: 0, finding_lines: [] }] },
        { role: "boilerplate", files: [{ path: "gone.lock", additions: 1, deletions: 0, finding_lines: [] }] },
      ],
      split_suggestion: { too_big: false, total_lines: 3, proposed_splits: [] },
    };
    const byPath = new Map([["src/a.ts", [finding("1", "src/a.ts"), finding("2", "src/a.ts")]]]);
    const groups = toViewerGroups(smart, files, byPath);

    expect(groups.map((g) => g.role)).toEqual(["core", "docs"]);
    expect(groups[0]!.files.map((f) => f.path)).toEqual(["src/a.ts", "src/new.ts"]);
    expect(groups[0]!.files[0]!.patch).toBe("PATCH-A");
    expect(groups[0]!.withFindings).toBe(1);
    expect(groups[1]!.withFindings).toBe(0);
  });
});
