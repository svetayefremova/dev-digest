import type { SmartDiff, SmartDiffFile, SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from './classify.js';
import { SMART_DIFF_ROLE_ORDER } from './constants.js';

export interface SmartDiffInputFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface SmartDiffInputFinding {
  file: string;
  startLine: number;
}

export interface SmartDiffInputReview {
  agentId: string | null;
  createdAt: Date;
  findings: SmartDiffInputFinding[];
}

/** Newest review per agent (`null` agent = one key). Independent of input order. */
export function latestPerAgent<R extends { agentId: string | null; createdAt: Date }>(
  reviews: R[],
): R[] {
  const newest = new Map<string | null, R>();
  for (const r of reviews) {
    const cur = newest.get(r.agentId);
    if (!cur || r.createdAt.getTime() > cur.createdAt.getTime()) newest.set(r.agentId, r);
  }
  return [...newest.values()];
}

export function buildSmartDiff(
  files: SmartDiffInputFile[],
  findings: SmartDiffInputFinding[],
): SmartDiff {
  const linesByPath = new Map<string, Set<number>>();
  for (const f of findings) {
    const set = linesByPath.get(f.file) ?? new Set<number>();
    set.add(f.startLine);
    linesByPath.set(f.file, set);
  }

  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
  let totalLines = 0;
  for (const f of files) {
    totalLines += f.additions + f.deletions;
    const role = classifyFile(f.path);
    const list = byRole.get(role) ?? [];
    list.push({
      path: f.path,
      pseudocode_summary: null,
      additions: f.additions,
      deletions: f.deletions,
      finding_lines: [...(linesByPath.get(f.path) ?? [])].sort((a, b) => a - b),
    });
    byRole.set(role, list);
  }

  return {
    groups: SMART_DIFF_ROLE_ORDER.flatMap((role) => {
      const list = byRole.get(role);
      return list && list.length > 0 ? [{ role, files: list }] : [];
    }),
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}
