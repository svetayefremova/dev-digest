import { describe, it, expect } from "vitest";
import type { SkillVersion } from "@devdigest/shared";
import { diffLines, diffStat, formatVersionDate, sortVersions } from "./helpers";

// Compact view of a diff: " line", "-line", "+line".
const compact = (before: string, after: string) =>
  diffLines(before, after).map((l) => (l.kind === "same" ? " " : l.kind === "add" ? "+" : "-") + l.text);

describe("diffLines", () => {
  it("returns only unchanged lines for identical texts", () => {
    expect(compact("a\nb", "a\nb")).toEqual([" a", " b"]);
    expect(diffStat(diffLines("a\nb", "a\nb"))).toEqual({ added: 0, removed: 0 });
  });

  it("marks a changed line as removed then added, keeping the context", () => {
    expect(compact("a\nb\nc", "a\nB\nc")).toEqual([" a", "-b", "+B", " c"]);
  });

  it("detects an insertion and a deletion in the middle", () => {
    expect(compact("a\nc", "a\nb\nc")).toEqual([" a", "+b", " c"]);
    expect(compact("a\nb\nc", "a\nc")).toEqual([" a", "-b", " c"]);
  });

  it("keeps the longest common subsequence when lines move apart", () => {
    expect(compact("a\nb\nc\nd", "b\nx\nd\ne")).toEqual(["-a", " b", "-c", "+x", " d", "+e"]);
  });

  it("handles an empty side", () => {
    expect(compact("", "a\nb")).toEqual(["+a", "+b"]);
    expect(compact("a\nb", "")).toEqual(["-a", "-b"]);
    expect(compact("", "")).toEqual([]);
  });

  it("numbers lines on each side independently", () => {
    expect(diffLines("a\nb\nc", "a\nx\ny\nc")).toEqual([
      { kind: "same", text: "a", oldNo: 1, newNo: 1 },
      { kind: "del", text: "b", oldNo: 2 },
      { kind: "add", text: "x", newNo: 2 },
      { kind: "add", text: "y", newNo: 3 },
      { kind: "same", text: "c", oldNo: 3, newNo: 4 },
    ]);
  });

  it("treats CRLF and LF line endings as the same line", () => {
    expect(compact("a\r\nb", "a\nb")).toEqual([" a", " b"]);
  });

  it("counts added and removed lines", () => {
    expect(diffStat(diffLines("a\nb\nc", "a\nx\ny"))).toEqual({ added: 2, removed: 2 });
  });
});

describe("sortVersions", () => {
  it("orders newest first without mutating the input", () => {
    const v = (version: number) => ({ version }) as SkillVersion;
    const input = [v(1), v(3), v(2)];
    expect(sortVersions(input).map((x) => x.version)).toEqual([3, 2, 1]);
    expect(input.map((x) => x.version)).toEqual([1, 3, 2]);
  });
});

describe("formatVersionDate", () => {
  it("falls back to a dash for an unparseable timestamp", () => {
    expect(formatVersionDate("not a date")).toBe("—");
  });
});
