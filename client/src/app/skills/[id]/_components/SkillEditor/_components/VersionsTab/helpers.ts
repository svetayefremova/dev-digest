import type { SkillVersion } from "@devdigest/shared";

export type DiffKind = "same" | "add" | "del";

export interface DiffLine {
  kind: DiffKind;
  text: string;
  /** 1-based line number in the "before" text (absent on added lines). */
  oldNo?: number;
  /** 1-based line number in the "after" text (absent on removed lines). */
  newNo?: number;
}

const splitLines = (text: string): string[] => (text === "" ? [] : text.replace(/\r\n/g, "\n").split("\n"));

/**
 * Line-by-line diff of `before` → `after` (longest common subsequence).
 * Removed lines come before added ones inside a changed block. The common
 * prefix and suffix are trimmed first, so the quadratic table only covers the
 * part that actually changed.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const n = endA - start;
  const m = endB - start;
  // lcs[i][j] = LCS length of a[start+i..endA) and b[start+j..endB).
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[start + i] === b[start + j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let oldNo = 1;
  let newNo = 1;
  const same = (text: string) => out.push({ kind: "same", text, oldNo: oldNo++, newNo: newNo++ });
  const del = (text: string) => out.push({ kind: "del", text, oldNo: oldNo++ });
  const add = (text: string) => out.push({ kind: "add", text, newNo: newNo++ });

  for (let k = 0; k < start; k++) same(a[k]!);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[start + i] === b[start + j]) {
      same(a[start + i]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      del(a[start + i++]!);
    } else {
      add(b[start + j++]!);
    }
  }
  while (i < n) del(a[start + i++]!);
  while (j < m) add(b[start + j++]!);
  for (let k = endA; k < a.length; k++) same(a[k]!);

  return out;
}

/** Added / removed line counts of a diff. */
export function diffStat(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === "add") added++;
    else if (line.kind === "del") removed++;
  }
  return { added, removed };
}

/** Newest version first, whatever order the API returned. */
export function sortVersions(versions: SkillVersion[]): SkillVersion[] {
  return [...versions].sort((x, y) => y.version - x.version);
}

const DATE_FORMAT = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** Human date for a version row; "—" when the timestamp is missing or invalid. */
export function formatVersionDate(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? "—" : DATE_FORMAT.format(time);
}
