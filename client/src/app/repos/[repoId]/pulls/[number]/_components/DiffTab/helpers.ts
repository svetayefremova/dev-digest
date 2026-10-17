import type { FindingRecord, PrFile, ReviewRecord, SmartDiff, SmartDiffRole } from "@devdigest/shared";
import { SMART_DIFF_ROLES } from "./constants";

/** Newest review per agent (`null` agent = one key). Mirrors the server rule. */
export function latestPerAgent(reviews: ReviewRecord[]): ReviewRecord[] {
  const newest = new Map<string | null, ReviewRecord>();
  for (const r of reviews) {
    const cur = newest.get(r.agent_id);
    if (!cur || Date.parse(r.created_at) > Date.parse(cur.created_at)) newest.set(r.agent_id, r);
  }
  return [...newest.values()];
}

export function findingsByPath(reviews: ReviewRecord[]): Map<string, FindingRecord[]> {
  const out = new Map<string, FindingRecord[]>();
  for (const r of latestPerAgent(reviews)) {
    for (const f of r.findings) {
      const list = out.get(f.file) ?? [];
      list.push(f);
      out.set(f.file, list);
    }
  }
  return out;
}

export interface ViewerGroup {
  role: SmartDiffRole;
  files: PrFile[];
  withFindings: number;
  findingCount: number;
}

/** Map server groups onto PrFiles; files the server didn't list land in `core` so none are hidden. */
export function toViewerGroups(
  smart: SmartDiff,
  files: PrFile[],
  byPath: ReadonlyMap<string, FindingRecord[]>,
): ViewerGroup[] {
  const byFilePath = new Map(files.map((f) => [f.path, f]));
  const listed = new Set<string>();
  const filesByRole = new Map<SmartDiffRole, PrFile[]>();
  for (const g of smart.groups) {
    const list = filesByRole.get(g.role) ?? [];
    for (const sf of g.files) {
      const f = byFilePath.get(sf.path);
      if (!f) continue;
      listed.add(sf.path);
      list.push(f);
    }
    filesByRole.set(g.role, list);
  }
  const missing = files.filter((f) => !listed.has(f.path));
  if (missing.length > 0) {
    filesByRole.set("core", [...(filesByRole.get("core") ?? []), ...missing]);
  }
  return SMART_DIFF_ROLES.flatMap((role) => {
    const list = filesByRole.get(role);
    if (!list || list.length === 0) return [];
    const counts = list.map((f) => byPath.get(f.path)?.length ?? 0);
    return [
      {
        role,
        files: list,
        withFindings: counts.filter((c) => c > 0).length,
        findingCount: counts.reduce((a, c) => a + c, 0),
      },
    ];
  });
}
