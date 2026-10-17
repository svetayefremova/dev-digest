import type { FindingRecord } from "@devdigest/shared";
import { FOCUS_SEVERITY_RANK, MAX_FOCUS_ITEMS } from "./constants";

/**
 * Where a reviewer should look first: open (undismissed) CRITICAL then WARNING
 * code findings, by file/line within a severity. Suggestions and
 * lethal-trifecta notes are left to the Findings tab.
 */
export function pickFocusFindings(findings: FindingRecord[]): FindingRecord[] {
  return findings
    .filter(
      (f) =>
        !f.dismissed_at &&
        f.kind !== "lethal_trifecta" &&
        FOCUS_SEVERITY_RANK[f.severity] !== undefined,
    )
    .sort(
      (a, b) =>
        FOCUS_SEVERITY_RANK[a.severity]! - FOCUS_SEVERITY_RANK[b.severity]! ||
        a.file.localeCompare(b.file) ||
        a.start_line - b.start_line,
    )
    .slice(0, MAX_FOCUS_ITEMS);
}
