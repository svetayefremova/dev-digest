# mcp — INSIGHTS

Append-only log of engineering insights captured in `mcp/`. Written by the `engineering-insights` skill (proactively, or via `/engineering-insights` at the end of a session/task). Read this before nontrivial work in this module — treat it as high-confidence guidance unless something here is clearly outdated.

**Rules:** never overwrite an entry — append a new dated correction instead. Each entry: date + concrete fact + `file:line` where applicable. Skip anything obvious from reading the code.

## What Works

- 2026-10-17 — `@modelcontextprotocol/sdk` 1.32.1 + `zod` 3.25.76 (resolved from `^1.0.0` / `^3.24.1`) work together: `registerTool(name, { title, description, inputSchema, outputSchema, annotations, _meta }, cb)` takes zod v3 raw shapes (`node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts:161`). `_meta` IS supported on `registerTool` and is emitted in `tools/list` (`server/mcp.js:126,747`), so `anthropic/requiresUserInteraction` needs no low-level handler (asserted in `test/server.test.ts`).
- 2026-10-17 — `isError: true` results skip `outputSchema` validation (`server/mcp.js:237`), so error results need no structuredContent even on tools that declare one. `InMemoryTransport.createLinkedPair()` is exported from `@modelcontextprotocol/sdk/inMemory.js`; `Client#getInstructions()` exists.
- 2026-10-17 — Run-done vs review-persisted ordering is NOT a race: `run-executor.ts:317-352` writes the review, findings and `completeAgentRun(status:'done')` in ONE transaction (`persistRunOutcome`), so a `done` run always has its `kind:'review'` row. The one-retry in `run_agent_on_pr` is defensive only.
- 2026-10-17 — Launching `tsx mcp/src/index.ts` from the repo root works (verified with a raw JSON-RPC initialize + tools/list over stdio): `import type` from `@devdigest/shared` is erased, so no tsconfig paths are needed at runtime.

## What Doesn't Work

- 2026-10-17 — Do NOT copy `reviewer-core`'s `"zod": ["./node_modules/zod"]` / `"zod/*"` tsconfig paths into `mcp/tsconfig.json`: with SDK 1.32 (which imports `zod/v3` + `zod/v4`) `tsc` fails with TS2589 "excessively deep" and then OOMs (4 GB heap) on any `registerTool` call. Removing the two zod paths fixes it (`mcp/tsconfig.json`); `mcp/node_modules/zod` is found by normal resolution anyway.

## Codebase Patterns

- 2026-10-17 — `git grep` ignores untracked files, so the plan's Verification greps are silent no-ops until files are staged/committed; use `git grep --untracked` (and exclude `mcp/node_modules`) when checking before the first commit.

## Tool & Library Notes

- 2026-10-17 — macOS has no `timeout` binary; a `timeout 60 tsc ...` pipeline exits 127 and prints nothing, which looks like a clean typecheck. Check exit codes.

## Recurring Errors & Fixes

- 2026-10-17 — `new Response(...)` reused through `mockResolvedValue` fails the 2nd call with "Body is unusable: Body has already been read"; use `mockImplementation(async () => new Response(...))` (`test/http.test.ts`).

## Session Notes

## Open Questions
