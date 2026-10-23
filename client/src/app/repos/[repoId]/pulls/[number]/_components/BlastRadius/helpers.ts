import type { BlastRadiusResponse } from "@devdigest/shared";

export interface BlastStats {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/** Unique counts across all downstream groups (callers de-duplicated by file:line:name). */
export function blastStats(data: Pick<BlastRadiusResponse, "changed_symbols" | "downstream">): BlastStats {
  const callers = new Set<string>();
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  for (const d of data.downstream) {
    for (const c of d.callers) callers.add(`${c.file}:${c.line}:${c.name}`);
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const c of d.crons_affected) crons.add(c);
  }
  return {
    symbols: data.changed_symbols.length,
    callers: callers.size,
    endpoints: endpoints.size,
    crons: crons.size,
  };
}
