/* Findings overlay for the diff: maps FindingRecords onto parsed lines.
   Presentational only — the caller supplies the card renderer (render-prop). */
import type React from "react";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import type { Line } from "./helpers";
import { keysForLine, lineKey } from "./comments";

export interface DiffFindingApi {
  /** Findings to overlay, keyed by file path. */
  byPath: ReadonlyMap<string, FindingRecord[]>;
  render: (f: FindingRecord) => React.ReactNode;
  /** When false, finding cards are hidden; the line stripe + file dot stay. */
  show: boolean;
}

type LineSeverity = "CRITICAL" | "WARNING" | "SUGGESTION" | "INFO";
const SEVERITY_RANK: readonly LineSeverity[] = ["CRITICAL", "WARNING", "SUGGESTION", "INFO"];

/** The most severe severity among a line's findings (drives stripe colour + label). */
export function topSeverity(list: FindingRecord[]): LineSeverity {
  let best = SEVERITY_RANK.length - 1;
  for (const f of list) {
    const i = SEVERITY_RANK.indexOf(f.severity as LineSeverity);
    if (i >= 0 && i < best) best = i;
  }
  return SEVERITY_RANK[best]!;
}

/** A caller-defined group of files (label, colour and default-open come from the caller). */
export interface DiffFileGroup {
  id: string;
  label: string;
  hint: string;
  meta: string;
  color: string;
  files: PrFile[];
  defaultOpen?: boolean;
}

/** Split a file's findings into ones anchored to a rendered new-file line vs. off-patch. */
export function partitionFindings(
  list: FindingRecord[],
  lines: Line[],
): { byLine: Map<string, FindingRecord[]>; offPatch: FindingRecord[] } {
  const rendered = new Set<string>();
  for (const ln of lines) {
    if (ln.kind === "add" || ln.kind === "ctx") {
      const k = lineKey("RIGHT", ln.newNo);
      if (k) rendered.add(k);
    }
  }
  const byLine = new Map<string, FindingRecord[]>();
  const offPatch: FindingRecord[] = [];
  for (const f of list) {
    const k = lineKey("RIGHT", f.start_line);
    if (k && rendered.has(k)) {
      const bucket = byLine.get(k) ?? [];
      bucket.push(f);
      byLine.set(k, bucket);
    } else {
      offPatch.push(f);
    }
  }
  return { byLine, offPatch };
}

/** Findings anchored to a given parsed line (new-file side only). */
export function findingsForLine(ln: Line, byLine: Map<string, FindingRecord[]>): FindingRecord[] {
  if (byLine.size === 0) return [];
  const out: FindingRecord[] = [];
  for (const key of keysForLine(ln)) {
    if (!key.startsWith("RIGHT")) continue;
    const list = byLine.get(key);
    if (list) out.push(...list);
  }
  return out;
}
