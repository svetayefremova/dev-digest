# Plan: Add Blast Radius (PR Overview block + MCP `get_blast_radius`)

Status: approved · Date: 2026-10-22 · Modules: server, client, mcp · Spec: none (small feature, by user decision)


## Context
Reviewers look at a diff but don't see what else in the repo the change can affect. `repo-intel` already built a symbol/reference index at clone time. `repoIntel.getBlastRadius(repoId, changedFiles)` (`server/src/modules/repo-intel/service.ts:223`) returns the whole map as `BlastResult`, never throws, and degrades with a reason. What's missing is the transport and the presentation: a `GET /pulls/:id/blast` route that maps `BlastResult` (flat `callers[]` with `viaSymbol`) into the shared `BlastRadius` contract (callers grouped per symbol), a **Blast radius** block on the PR Overview tab, and the real `get_blast_radius` MCP tool, so Claude Code gets the same answer as the browser. No model calls and no re-analysis.

### Starter audit (what exists vs. what's missing)
| Piece | State |
|---|---|
| Facade `getBlastRadius` + `BlastResult` types (`repo-intel/types.ts:57-87`) | ✅ exists. The persistent path is used when the index is `full`/`partial`; otherwise it falls back to ripgrep (always `degraded:true, reason:'no_data'`, no `factsByFile`) |
| `BlastRadius` Zod contract (`server/src/vendor/shared/contracts/brief.ts:42-70`, identical client copy) | ✅ exists, but has **no `degraded`/`reason` fields**, so a response schema is needed |
| `githubBlobUrl` (`client/src/lib/github-urls.ts:24`) | ✅ |
| `client/messages/en/blast.json` (stat.*, view.*, callerCount, noDownstream, graph.*) | ✅, but it lacks a title and degraded-state copy |
| `useRepoIntelStatus` / `useResyncRepoIntel` (`client/src/lib/hooks/repo-intel.ts`) | ✅ reuse for the "rebuild index" action |
| MCP stub `mcp/src/tools/get-blast-radius.ts` (+ "not implemented" note in `mcp/src/server.ts:13`) | ✅ stub, to be replaced |
| `server/src/modules/blast/`, route, client hook, UI block | ❌ to build |
| Facade gaps | ❌ (1) `callers.slice(0, MAX_CALLERS_PER_SYMBOL)` caps the **total** list, not per symbol; (2) a `partial` index returns `degraded:false` with no `index_partial` reason. **Fix both** (user decision). The ripgrep fallback stays as is. |

Live check: the API on :3001 has `svetayefremova/dev-digest` (`daa993c1-…`) at `status: full`, and repo `412619ca-…` is `degraded/no_data`, so both scenarios can be checked by hand.

## Decisions
- **Response contract:** add `BlastDegradedReason = z.enum(['flag_off','index_failed','index_partial','repo_too_large','no_data'])` and `BlastRadiusResponse = BlastRadius.extend({ degraded: z.boolean(), reason: BlastDegradedReason.nullable() })` to `brief.ts` (both copies, byte-identical) and export them from both `vendor/shared/index.ts` barrels if `brief.ts` isn't re-exported with `*`. `BlastRadius` and `PrBrief` stay unchanged.
- **Downstream grouping:** one `DownstreamImpact` per changed symbol name that has ≥1 caller, in `changed_symbols` order. Callers are mapped `{ name: c.symbol, file, line }` in facade order (rank desc). Endpoints and crons for a group are the de-duplicated union of `factsByFile[callerFile]` over that group's caller files. Without `factsByFile` (fallback path) they are `[]`.
- **Summary:** deterministic string `"<n> symbols · <n> callers · <n> endpoints · <n> crons"` (unique endpoint/cron counts across groups). The client computes its stat row from the arrays, not by parsing the string.
- **Degraded honesty:** `degraded`/`reason` are passed through. A degraded response that still has callers (fallback path) **shows the data plus a notice**; it doesn't hide it.
- **No changed files (F1, user-approved deviation during /run-plan):** `BlastDegradedReason` also has `no_changed_files`. When the PR has no persisted `pr_files`, `BlastService` returns `emptyBlastRadius('no_changed_files')` without calling the facade; the UI shows a "reopen the PR" notice without the Rebuild index button, and MCP prints an open-the-PR hint instead of "Index degraded".
- **Views:** tree (default) + graph toggle (user decision). The graph is a dependency-free SVG drill-in for the symbol that's expanded or selected in the tree.
- **MCP:** a thin pass-through of the route. Text output is rendered like the tree and prefixed with `UNTRUSTED_MARKER` (symbol and file names come from repo content). `readOnlyHint: true`, `openWorldHint: false`.

## Skills per module
- server: onion-architecture, fastify-best-practices, zod, typescript-expert, engineering-insights (read `server/INSIGHTS.md` + `server/src/modules/repo-intel/README.md` first)
- client: frontend-architecture, react-best-practices, next-best-practices, engineering-insights (`client/INSIGHTS.md`)
- mcp: typescript-expert, zod, engineering-insights (`mcp/INSIGHTS.md`, `mcp/CLAUDE.md`)

## Steps

### S1 — `BlastRadiusResponse` contract (both copies)   [module: server + client vendor/shared] [skills: zod] [workstream: W0]
- Files: `server/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/brief.ts` (+ barrels if needed)
- Change: add `BlastDegradedReason`, `BlastRadiusResponse` + inferred types right after `BlastRadius`.
- Acceptance: `diff` of the two copies is empty; typecheck passes in server and client.

### S2 — Facade fixes: per-symbol cap + partial index flag   [module: server] [skills: onion-architecture] [workstream: W1]
- File: `server/src/modules/repo-intel/service.ts` (`tryPersistentBlast`)
- Change: replace `callers.slice(0, MAX_CALLERS_PER_SYMBOL)` with a per-`viaSymbol` cap (keep the rank-desc order, take the first N per symbol). When `state.status === 'partial'`, return `degraded: true, reason: 'index_partial'` (data kept). Update the method's doc comment accordingly.
- Acceptance: existing repo-intel tests still pass.

### S3 — `blast` module: pure mapper, service, route, registration   [module: server] [skills: onion-architecture, fastify-best-practices, zod] [workstream: W1]
- Files (new): `server/src/modules/blast/map.ts`, `service.ts`, `routes.ts`; edit `server/src/modules/index.ts` (add `blast`).
- `map.ts`: pure `toBlastRadius(result: BlastResult): BlastRadiusResponse`, following the Decisions above. No I/O.
- `service.ts` (`BlastService(container)`): `get(workspaceId, prId)` → `reviewRepo.getPull(workspaceId, prId)` (404 `NotFoundError` if missing) → `reviewRepo.getPrFiles(prId)` → paths → **one** `container.repoIntel.getBlastRadius(pull.repoId, paths)` → `toBlastRadius`. Same shape as `SmartDiffService` (`server/src/modules/smart-diff/service.ts`).
- `routes.ts`: `GET /pulls/:id/blast`, `schema: { params: IdParams, response: { 200: BlastRadiusResponse } }`, `getContext` for the workspace. Mirrors `smart-diff/routes.ts`.
- Acceptance: `curl localhost:3001/pulls/<prId>/blast` for a PR on the `full` repo returns a valid body with `degraded:false`. On the `412619ca` repo it returns `degraded:true, reason:'no_data'`.

### S4 — Copy for the block   [module: client] [workstream: W2]
- File: `client/messages/en/blast.json`: add `title` ("Blast radius"), `degraded.{no_data,index_partial,index_failed,flag_off,repo_too_large}` (one sentence each, e.g. partial → "Repository index is incomplete — callers may be missing."), `action.resync` ("Rebuild index"), `action.resyncing`, `noSymbols` ("No indexed symbols in the changed files."), `error`, `crons` chip aria, `graph.legend.{symbol,callers,endpoints}`.

### S5 — `useBlastRadius` hook   [module: client] [skills: react-best-practices, frontend-architecture] [workstream: W2]
- Files: new `client/src/lib/hooks/blast.ts`, export from `client/src/lib/hooks/index.ts`.
- `useBlastRadius(prId)` → `useQuery({ queryKey: ['pr-blast', prId], queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`), enabled: !!prId })`. Pattern: `hooks/intent.ts`.

### S6 — `BlastRadiusCard` on the Overview tab (tree view, states)   [module: client] [skills: react-best-practices, frontend-architecture, next-best-practices] [workstream: W2]
- Files (new): `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadius/{BlastRadius.tsx, BlastTree.tsx, helpers.ts, styles.ts, index.ts}`. Edit `OverviewTab.tsx` (render after `IntentCard`, pass `repoId`) and `page.tsx` (pass `repoId` from params).
- `helpers.ts` (pure): `blastStats(data)` → `{symbols, callers, endpoints, crons}` (unique counts).
- Layout per the design: header (icon + title, right-aligned "N callers · N endpoints"), stat row (symbols/callers/endpoints/crons with `stat.*` copy), Tree/Graph segmented toggle (`view.*`).
- Tree: one collapsible row per `downstream` entry (first expanded) with `callerCount`. Under it, `↳ file:line` links → `githubBlobUrl(repoFullName, headSha, file, line)` with `target="_blank" rel="noopener noreferrer"` (plain text when `repoFullName` is null). Then endpoint chips (globe) and cron chips (clock, warning tone).
- States: loading skeleton. Error → `error` copy. `changed_symbols` empty → `noSymbols`. Symbols but empty `downstream` → `noDownstream` with the count. `degraded` → notice with `degraded.<reason>` plus a "Rebuild index" button that uses `useResyncRepoIntel(repoId)`, then polls `useRepoIntelStatus(repoId, true)` until `updatedAt` advances and invalidates `['pr-blast', prId]` (the same completion signal `ProjectContextView` uses). A degraded notice is shown **above** any data present.

### S7 — Graph drill-in view   [module: client] [skills: react-best-practices, frontend-architecture] [workstream: W2]
- Files (new): `_components/BlastRadius/BlastGraph.tsx`, `graph-layout.ts` (pure).
- `layoutBlastGraph(impact)` → three columns: changed symbol (left) → caller nodes labelled by caller `name` (middle) → endpoint/cron nodes (right). It returns node boxes and cubic-bezier edge paths. Edges symbol→caller are solid. Endpoints are attributed per symbol (not per caller) in the contract, so symbol→endpoint/cron edges are drawn **dashed** behind the caller column. Inline `<svg>` with `aria-label={t('graph.ariaLabel')}`, theme via CSS vars, a legend row. It shows the symbol currently selected in the tree (default: first). No downstream → `graph.empty`. No new npm dependency.

### S8 — MCP: real `get_blast_radius`   [module: mcp] [skills: typescript-expert, zod] [workstream: W3]
- `mcp/src/api/types.ts` + `http.ts`: add `blast(prId): Promise<BlastRadiusResponse>` (`import type` from `@devdigest/shared`), GET `/pulls/:id/blast`, and update the "Exactly 8 methods" comment.
- New `mcp/src/application/get-blast-radius.ts`: `resolveRepo` → `resolvePull` → `api.blast(prId)` → `ok({ structured, text })`. The text has `UNTRUSTED_MARKER`, a head line `Blast radius for <repo>#<pr>: <summary>`, a degraded line (`Index degraded (<reason>) — results may be incomplete; rebuild in the DevDigest UI.`), then per symbol `- symbol (N callers)`, `  ↳ file:line (name)`, `  endpoints: …`, `  crons: …`, passed through `truncate`.
- `mcp/src/schemas.ts`: `blastOutput` that mirrors the response. `mcp/src/tools/get-blast-radius.ts`: replace the stub with `handleGetBlastRadius(deps, args)` via `guard`/`toResult`, a real title/description ("…which symbols the PR's changed files declare, who calls them (file:line), and which HTTP endpoints and cron jobs depend on them. Reads the precomputed repo index; no LLM. Read-only."), `outputSchema`, `annotations: { readOnlyHint: true, openWorldHint: false }`. `register…(server, deps)` and update the call in `server.ts`.
- `mcp/src/server.ts`: drop "get_blast_radius is not implemented yet" from the instructions and mention the tool.
- Update `mcp/test/fake-api.ts` so it implements the new port method (it's a test helper, so it's owned by TW-mcp).

## Tests
`test-writer` writes these. The implementer writes none.

| ID | Proves | Kind | File | Scenario | Package |
|---|---|---|---|---|---|
| T1 | mapping | unit | `server/test/blast-map.test.ts` (new) | 2 changed symbols, flat callers via both, `factsByFile` for 2 files → 2 groups, correct callers, endpoints/crons deduped per group, summary string; symbol without callers → absent from downstream; no `factsByFile` → empty endpoints; degraded/reason passed through (`undefined` → `false`/`null`) | server |
| T2 | facade fixes | it (Testcontainers) or unit with fake repo | `server/test/repo-intel-blast.*.test.ts` (new) | 25 callers per symbol for 2 symbols → 20 each (40 total); `partial` index → `degraded:true, reason:'index_partial'` with data | server |
| T3 | route | it (Testcontainers) | `server/test/blast.it.test.ts` (new) | seeded PR + files, `ContainerOverrides.repoIntel` fake → 200 contract-valid body, the fake called once with the PR's paths; unknown / other-workspace PR → 404 | server |
| T4 | helpers + layout | unit | `client/.../BlastRadius/helpers.test.ts`, `graph-layout.test.ts` | unique counts; node columns/edges count, dashed edges for endpoints | client |
| T5 | block states | RTL | `client/.../BlastRadius/BlastRadius.test.tsx` | tree renders symbols, `file:line` links with the correct GitHub href; noDownstream; noSymbols; degraded notice + data together; resync button calls POST; Graph toggle shows the svg | client |
| T6 | MCP tool | unit | `mcp/test/get-blast-radius.test.ts` (new) + `fake-api.ts`, `server.test.ts` (update annotations/listing) | resolves repo/PR → text has marker, symbols, file:line, endpoints; degraded line; PR not found → tool error; `readOnlyHint: true` | mcp |

## Execution
| Workstream | Steps | Owns files | Packages | Depends on |
|---|---|---|---|---|
| W0 | S1 | `server/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/brief.ts`, both `vendor/shared/index.ts` | server, client | — |
| W1 | S2, S3 | `server/src/modules/repo-intel/service.ts`, `server/src/modules/blast/**`, `server/src/modules/index.ts` | server | W0 |
| W2 | S4–S7 | `client/messages/en/blast.json`, `client/src/lib/hooks/{blast,index}.ts`, `client/src/app/repos/[repoId]/pulls/[number]/{page.tsx,_components/OverviewTab/**,_components/BlastRadius/**}` (non-test) | client | W0 |
| W3 | S8 | `mcp/src/{api,application,tools,schemas.ts,server.ts}` blast-related files | mcp | W0 (W1 for live check) |
| TW-server | T1–T3 | `server/test/blast-*.test.ts`, `server/test/repo-intel-blast.*` | server | W1 |
| TW-client | T4–T5 | `client/.../BlastRadius/*.test.ts(x)` | client | W2 |
| TW-mcp | T6 | `mcp/test/get-blast-radius.test.ts`, `mcp/test/fake-api.ts`, `mcp/test/server.test.ts` | mcp | W3 |

Run order: W0 → (W1 ∥ W2), then W3 → check gate → (TW-server ∥ TW-client ∥ TW-mcp).

## Verification
1. `scripts/check.sh` per package (typecheck + tests) for server, client, mcp; `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` is empty.
2. Live API: `curl -s localhost:3001/repos/daa993c1-4703-42c8-9504-ee1e9d26ca7a/pulls` → pick a PR id → `curl -s localhost:3001/pulls/<id>/blast | jq` (`degraded:false`, grouped downstream). Repeat on a PR of repo `412619ca-…` → `degraded:true, reason:'no_data'`.
3. UI (`run-app` skill): open `/repos/<repoId>/pulls/<n>` → Overview shows Blast radius with stats, tree, working GitHub `file:line` links, Graph toggle; the degraded repo shows the notice + "Rebuild index".
4. MCP: rebuild `mcp` and call `get_blast_radius { repo, pr }` from Claude Code. The output must match the UI numbers.

## Out of scope
- Re-analysing code, new indexing, LLM calls, changes to `BFS_DEPTH`.
- Changing the ripgrep fallback's `no_data` tagging (gap 3).
- Per-caller endpoint attribution in the contract (graph uses dashed symbol-level edges instead).
