import type { BlastDegradedReason, BlastRadiusResponse, DownstreamImpact } from '@devdigest/shared';
import type { BlastResult } from '../repo-intel/types.js';

/** Pure mapper: facade `BlastResult` (flat callers) → shared `BlastRadiusResponse` (grouped per symbol). No I/O. */
export function toBlastRadius(result: BlastResult): BlastRadiusResponse {
  const downstream: DownstreamImpact[] = [];
  const seenSymbols = new Set<string>();
  const allEndpoints = new Set<string>();
  const allCrons = new Set<string>();
  let callerCount = 0;

  for (const sym of result.changedSymbols) {
    if (seenSymbols.has(sym.name)) continue;
    seenSymbols.add(sym.name);

    const callers = result.callers.filter((c) => c.viaSymbol === sym.name);
    if (callers.length === 0) continue;

    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const file of new Set(callers.map((c) => c.file))) {
      const facts = result.factsByFile?.[file];
      if (!facts) continue;
      for (const e of facts.endpoints) endpoints.add(e);
      for (const c of facts.crons) crons.add(c);
    }
    for (const e of endpoints) allEndpoints.add(e);
    for (const c of crons) allCrons.add(c);
    callerCount += callers.length;

    downstream.push({
      symbol: sym.name,
      callers: callers.map((c) => ({ name: c.symbol, file: c.file, line: c.line })),
      endpoints_affected: [...endpoints],
      crons_affected: [...crons],
    });
  }

  return {
    changed_symbols: result.changedSymbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    downstream,
    summary: `${result.changedSymbols.length} symbols · ${callerCount} callers · ${allEndpoints.size} endpoints · ${allCrons.size} crons`,
    degraded: result.degraded ?? false,
    reason: result.reason ?? null,
  };
}

/** Pure: empty, degraded response for when the PR has no persisted changed files (facade is not consulted). */
export function emptyBlastRadius(reason: BlastDegradedReason): BlastRadiusResponse {
  return {
    changed_symbols: [],
    downstream: [],
    summary: '0 symbols · 0 callers · 0 endpoints · 0 crons',
    degraded: true,
    reason,
  };
}
