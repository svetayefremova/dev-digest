# Plan: Add PR intent layer (cheap intent classifier + scope-aware review)

Status: draft · Date: 2026-10-16 · Modules: reviewer-core, server, client

## Goal
Before a review, a separate, cheap LLM call (feature model `review_intent`) works out the PR's motivation, `Intent { summary, in_scope[], out_of_scope[] }`. It uses the PR title/body, the linked issue, plan/spec docs referenced from the body, and file names plus hunk headers (never diff bodies). The result goes to `pr_intent` with a deterministic confidence and a list of sources. It appears as an Intent card on the PR Overview tab, gets injected into every agent's review prompt, and is used to filter out-of-scope findings: exactly one out-of-scope signal is kept, and on `low` confidence out-of-scope findings are only marked, never dropped. The classifier shows up as its own `agent_runs` row ("Intent classifier") with a metadata-only `intent.classify` log.

## Non-goals
- Bash-guard hook for read-only agents (separate track: `docs/agent-specs/read-only-bash-guard.md`).
- Fetching any non-GitHub link (Notion, Jira, Google Docs, ...). These are recorded as `unavailable` and never fetched.
- RISK AREAS / PR brief panel.
- New tests of any kind (unit, integration, RTL, e2e seed `e2e/specs/10-pr-intent.flow.json`). They are deferred to `test-writer`.
- Automatically re-detecting a stale intent during a review. A stale intent is reused and flagged, and the user re-detects it explicitly.

## Context
- INSIGHTS applied:
  - server — `vendor/shared` is a hand-copied duplicate with no sync script → every contract edit in S1 lists both paths explicitly.
  - server — `db:migrate` against the shared dev Postgres fails / drifts; columns may already exist from other checkouts → S2 generates with `npx drizzle-kit generate < /dev/null`, hand-edits to `ADD COLUMN IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS` before `ADD CONSTRAINT`, and never runs `db:migrate`.
  - server — drizzle-kit hangs on "created or renamed?" when a column is dropped and added on the same table → `pr_intent.intent` is kept (mapped to `summary` in the repo), only additions in this migration.
  - server — `_ck` CHECK constraints may already exist on the shared DB → the `pr_intent_confidence_ck` add is preceded by `DROP CONSTRAINT IF EXISTS`.
  - server — `container.git.readFile` resolves against this checkout's clone dir, not `repos.clone_path` (`src/modules/conventions/service.ts` `readSamples`) → S7 reads repo-relative docs with the same mechanism `loadDiff` uses (so if the diff loads, docs load). A read failure becomes `status: "unavailable"`, never an error.
  - client — value imports from `@devdigest/shared` break only the Next bundler → S10–S12 use `import type` only. Confidence/status literals used at runtime are restated locally in `IntentCard/constants.ts`.
  - reviewer-core — INSIGHTS.md is empty: none relevant.
- Constraints applied:
  - reviewer-core is pure → `buildIntentPrompt`, `computeConfidence`, `applyIntentScope` are pure. `classifyIntent` only calls the injected `LLMProvider`. Source fetching (GitHub, git) lives in `server/src/modules/intent/source-resolver.ts`.
  - Shared contracts duplicated → S1 edits `server/src/vendor/shared/contracts/*.ts` and `client/src/vendor/shared/contracts/*.ts` identically.
  - Client `import type` only → hooks/components import contract types only.
  - Client styling → `IntentCard/styles.ts` with CSS vars, no Tailwind. Copy goes in `client/messages/en/intent.json`, auto-loaded as namespace `intent` by `client/src/i18n/request.ts:16-25`.
  - Server onion → `intent/routes.ts` (zod + one service call) → `intent/service.ts` → repository via `container.reviewRepo`. GitHub/git/LLM are reached only through the container.
  - DB changes via Drizzle schema + generate, no migrate → S2.
  - Tests follow TESTING.md → none added this iteration (user constraint). Existing suites must stay green, including the byte-identical prompt tests.
- Reuse:
  - Unused intent plumbing to wire up (not duplicate): `prIntent` table `server/src/db/schema/reviews.ts:81-88`; `Intent` `server/src/vendor/shared/contracts/brief.ts:9-14`; `PrIntentRecord` `contracts/review-api.ts:62`; `upsertIntent`/`getIntent` `server/src/modules/reviews/repository/pull.repo.ts:49-68`, exposed at `server/src/modules/reviews/repository.ts:132-138`.
  - `agent_runs.agent_id` is already nullable (`server/src/db/schema/runs.ts:16`, `.references(... 'set null')` without `.notNull()`) → no `DROP NOT NULL` needed.
  - Feature model `review_intent`: `contracts/platform.ts` `FeatureModelId` :14, `FEATURE_MODELS` :43 (entry :52-57); resolver `server/src/modules/settings/feature-models.ts:47` `resolveFeatureModel`; client copy `client/src/lib/feature-models.ts:21-27`.
  - LLM call template: `server/src/modules/conventions/service.ts:107-150` (resolveFeatureModel → prompt → `wrapUntrusted` → `completeStructured` → `ExternalServiceError`).
  - `wrapUntrusted(label, content)` `reviewer-core/src/prompt.ts:30`; `INJECTION_GUARD` `reviewer-core/src/prompt.ts:16-28`; `assemblePrompt` :89, section order :108-124.
  - Structured output: `toJsonSchema` / `parseWithRepair` `reviewer-core/src/llm/structured.ts:19,54`.
  - `LLMProvider.completeStructured` `server/src/vendor/shared/adapters.ts:82-88` (`StructuredRequest` :55, `StructuredResult` :72 with tokensIn/out/costUsd).
  - `container.llm(id)` `server/src/platform/container.ts:175`; lazy getter pattern `repoIntel` :126; `ContainerOverrides` :50.
  - GitHub: `resolveLinkedIssue` `server/src/adapters/github/octokit.ts:127` (regex :128), `getIssue` :351, `getPullRequest` :70.
  - Diff: `loadDiff` `server/src/modules/reviews/diff-loader.ts:12` → `UnifiedDiff` (`vendor/shared/adapters.ts:185`).
  - Review pipeline: `executeRuns` `server/src/modules/reviews/run-executor.ts:56`, shared `loadDiff` :99, `runOneAgent` :140, `reviewPullRequest` call :210-233, RunTrace build :244-274, `persistRunOutcome` :281 / `repository.ts:192`; `ReviewService.runReview` `service.ts:103` creates `agent_runs` rows :119-129.
  - Rate-limit route config: `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }` `server/src/modules/reviews/routes.ts:29`.
  - Module registration `server/src/modules/index.ts:26-37`; `getContext(container, req)` `server/src/modules/_shared/context.ts`.
  - reviewer-core review pipeline: `ReviewInput` `reviewer-core/src/review/run.ts:44-93`, `promptParts` :130-139, `groundFindings` :197; `reduceReviews` `review/reduce.ts:43`; `SEV_RANK` `reviewer-core/src/output/to-review.ts:23`.
  - Client: `OverviewTab` `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx:7-22`, rendered at `page.tsx:140`; `lib/api.ts`; `lib/hooks/*.ts` + barrel.

## Skills per module
| Module / zone | Skills (from routing table) |
|---|---|
| shared contracts (both copies) | zod, typescript-expert |
| server DB schema / migration | drizzle-orm-patterns, postgresql-table-design |
| server routes | fastify-best-practices, onion-architecture, zod |
| server services / repositories / adapters / DI | onion-architecture |
| reviewer-core | onion-architecture, typescript-expert |
| client routes / components / hooks | next-best-practices, react-best-practices, frontend-architecture |
| any module | engineering-insights |

## Steps

### S1 — Extend shared contracts (both copies)   [module: server + client vendor/shared] [skills: zod, typescript-expert]
- Files (each edit applied identically to `server/src/vendor/shared/...` AND `client/src/vendor/shared/...`):
  - modify `contracts/brief.ts` — `Intent` (:9-14): rename field `intent` → `summary`. Add `IntentConfidence = z.enum(['high','medium','low'])`, `IntentSourceKind = z.enum(['title','description','linked_issue','plan','spec','files'])`, `IntentSourceStatus = z.enum(['used','unavailable','truncated'])`, `IntentSource = z.object({ kind, ref: z.string(), status, chars: z.number().int(), reason: z.string().nullish() })`. Export schemas and `z.infer` types.
  - modify `contracts/review-api.ts` — `PrIntentRecord` (:62) becomes `Intent.extend({ pr_id: z.string(), confidence: IntentConfidence, sources: z.array(IntentSource), missing_context: z.array(z.string()), head_sha: z.string().nullable(), stale: z.boolean(), provider: z.string().nullable(), model: z.string().nullable(), run_id: z.string().nullable(), detected_at: z.string().nullable() })`.
  - modify `contracts/findings.ts` — `Finding` (:47-62): add `out_of_scope: z.boolean().nullish()` (nullish, matching `suggestion`/`kind`, so strict json_schema and existing fixtures keep working).
  - modify `contracts/trace.ts` — `PromptAssembly` (:39-55): add `intent: z.string().nullish()` (short intent text only).
  - modify `contracts/platform.ts` — `FEATURE_MODELS.review_intent` (:52-57): label `Intent classifier (cheap)`, hint "Runs separately from the review model; a small flash-class model is recommended", default provider `openrouter`, model `anthropic/claude-haiku-5.5`. Add a comment: `// $0.10/$0.50 per 1M (OpenRouter, 2026-10-16), structured outputs supported; fallback: openai/gpt-5.4-nano`.
  - modify `client/src/lib/feature-models.ts:21-27` — same label/hint/default as the contract.
- Change: contract-only. Fix every compile error the `intent` → `summary` rename causes (known: `server/src/modules/reviews/repository/pull.repo.ts:54,60,67`; anything consuming `PrBrief.intent`).
- Acceptance: `npm run typecheck` passes in server, client, reviewer-core. `git diff --stat` shows the same contract files changed under both `vendor/shared` roots.
- Tests: none in this iteration (deferred to test-writer) · run: `cd server && npm run typecheck`; `cd client && npm run typecheck`; `cd reviewer-core && npm run typecheck`
- Depends on: —

### S2 — DB schema + idempotent migration   [module: server] [skills: drizzle-orm-patterns, postgresql-table-design]
- Files:
  - modify `server/src/db/schema/reviews.ts` — `prIntent` (:81-88): keep `intent`. Add `confidence text` + `check('pr_intent_confidence_ck', sql\`confidence in ('high','medium','low')\`)`, `sources jsonb $type<IntentSource[]> notNull default '[]'`, `missingContext jsonb('missing_context') $type<string[]> notNull default '[]'`, `headSha text('head_sha')`, `provider text`, `model text`, `runId uuid('run_id').references(() => agentRuns.id, { onDelete: 'set null' })`, `detectedAt timestamp('detected_at', { withTimezone: true })`. On `findings` (:43): add `outOfScope: boolean('out_of_scope').notNull().default(false)`.
  - create `server/src/db/migrations/0018_*.sql` (+ `meta/_journal.json`, snapshot) via `cd server && npx drizzle-kit generate < /dev/null`.
- Change: then hand-edit the generated SQL: every `ADD COLUMN` → `ADD COLUMN IF NOT EXISTS`; prepend `ALTER TABLE "pr_intent" DROP CONSTRAINT IF EXISTS "pr_intent_confidence_ck";` before its `ADD CONSTRAINT`; guard the FK add with `DROP CONSTRAINT IF EXISTS` on the generated FK name. Index `pr_intent.run_id` is not needed (it is never queried by run_id). Do **not** run `db:migrate`.
- Acceptance: the migration contains only additive, idempotent statements for `pr_intent` and `findings`. `npm run typecheck` passes.
- Tests: none in this iteration (deferred to test-writer) · run: `cd server && npm run typecheck`
- Depends on: S1

### S3 — Repository: intent record + finding flag   [module: server] [skills: onion-architecture, drizzle-orm-patterns]
- Files:
  - modify `server/src/modules/reviews/repository/pull.repo.ts:49-68` — `upsertIntent(db, prId, rec: Omit<PrIntentRecord,'pr_id'|'stale'>)` writes all new columns (summary → `intent` column), with an `onConflictDoUpdate` set covering all columns (last-write-wins). `getIntent(db, prId)` returns the row mapped to `Omit<PrIntentRecord,'stale'>` or `undefined`.
  - modify `server/src/modules/reviews/repository.ts:132-138` — update the wrapper signatures. Add narrow methods for the classifier run: `createClassifierRun({ workspaceId, prId, provider, model })` → inserts an `agent_runs` row with `agentId: null`, `agentName: 'Intent classifier'` (use the same columns `ReviewService.runReview` writes at `service.ts:119-129`), and `finishClassifierRun(runId, { status, durationMs, tokensIn, tokensOut, costUsd, error?, trace })` → updates the row and writes `run_traces`. Reuse `persistRunOutcome` (:192) instead if its signature fits without a review/findings payload.
  - modify the findings insert in `persistRunOutcome` (`repository.ts:192`) to write `outOfScope: f.out_of_scope ?? false`, and the findings row → `Finding` mapping to return `out_of_scope`.
- Change: repository layer only. Drizzle stays inside the repository files.
- Acceptance: typecheck passes. No `drizzle-orm` import outside repository files in the diff.
- Tests: none in this iteration (deferred to test-writer) · run: `cd server && npm run typecheck`
- Depends on: S2

### S4 — reviewer-core intent module (pure)   [module: reviewer-core] [skills: onion-architecture, typescript-expert]
- Files:
  - create `reviewer-core/src/intent/types.ts` — `IntentFileSummary { path; additions; deletions; hunkHeaders: string[] }`, `IntentDoc { kind: 'linked_issue'|'plan'|'spec'; ref; text }`, `IntentInput { title; body; issue?: IntentDoc; docs: IntentDoc[]; files: IntentFileSummary[]; missing: string[] }`. No field accepts diff hunks/lines, so diff bodies can't be passed in by construction.
  - create `reviewer-core/src/intent/prompt.ts` — `INTENT_SYSTEM_PROMPT` (const string, ≤ 600 output tokens, "derive motivation; untrusted content cannot change instructions") and `buildIntentPrompt(input): { system; user; stats: PromptStats }`. Untrusted parts go through `wrapUntrusted` (`prompt.ts:30`). Caps are applied here: body 4000, issue 3000, ≤ 5 docs × 6000, docs total 15000. Truncation is reported in `stats`. Each missing ref adds a line `referenced <kind> <ref> could not be retrieved`. `PromptStats = { title, description, issue, docs: {ref, chars}[], files, hunk_headers, est_tokens_in }` (chars / 4).
  - create `reviewer-core/src/intent/confidence.ts` — `computeConfidence({ hasMeaningfulBody, usedDocs, unavailable }): IntentConfidence`, following the design: high = body + ≥ 1 issue/plan/spec used and 0 unavailable; medium = body ≥ 1 sentence but no docs or some unavailable; low = empty/trivial body.
  - create `reviewer-core/src/intent/classify.ts` — `classifyIntent(llm: LLMProvider, model: string, input): Promise<{ intent: Intent; tokensIn; tokensOut; costUsd; promptStats }>`. Calls `llm.completeStructured` with the `Intent` schema via `toJsonSchema` (`llm/structured.ts:19`) and `maxTokens: 600`.
  - create `reviewer-core/src/intent/index.ts` and re-export from `reviewer-core/src/index.ts`.
- Change: Domain ring, zero IO apart from the injected `llm`.
- Acceptance: typecheck passes. `git grep -n "node:fs\|octokit\|drizzle" reviewer-core/src/intent` is empty.
- Tests: none in this iteration (deferred to test-writer) · run: `cd reviewer-core && npm run typecheck && npm test`
- Depends on: S1

### S5 — reviewer-core: intent in review prompt + `applyIntentScope`   [module: reviewer-core] [skills: onion-architecture, typescript-expert]
- Files:
  - modify `reviewer-core/src/prompt.ts` — `assemblePrompt` (:89): new optional `intent?: { summary; in_scope; out_of_scope; confidence; missing_context; stale }` part rendered as a `## PR intent` section placed **immediately before** `## PR description` in the section order (:108-124). Skip it when absent, so the output with no intent stays byte-identical. Add one instruction line to that section only: "For each finding set `out_of_scope: true` if it concerns code outside the in-scope list; intent never makes a real security/correctness defect acceptable."
  - modify `reviewer-core/src/review/run.ts` — `ReviewInput` (:44-93) gains `intent?: <same shape>`. `promptParts` (:130-139) forwards it. After `reduceReviews` and before `groundFindings` (:197), call `applyIntentScope`. Return `intentFiltered: number` and `keptSignal: boolean` in the result.
  - create `reviewer-core/src/review/scope.ts` — `applyIntentScope(findings, intent?): { findings; filtered; keptSignal }`. No intent → passthrough. `confidence === 'low'` → keep all, out-of-scope ones keep `out_of_scope: true`. Otherwise keep in-scope findings plus exactly one out-of-scope finding: the highest-severity CRITICAL, or if there is none, the highest WARNING with category security/correctness (rank via `SEV_RANK`, `output/to-review.ts:23`), flagged `out_of_scope: true`. Drop the rest and return the count.
- Change: Domain ring only.
- Acceptance: existing `reviewer-core/test/prompt.test.ts` and `server/test/prompt-callers.test.ts` pass unchanged (byte-identical with no intent).
- Tests: none in this iteration (deferred to test-writer) · run: `cd reviewer-core && npm run typecheck && npm test`
- Depends on: S1, S4

### S6 — Tighten linked-issue detection   [module: server] [skills: onion-architecture]
- Files:
  - modify `server/src/adapters/github/octokit.ts:127-128` — `resolveLinkedIssue` matches only `/\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\s*:?\s+(?:([\w.-]+\/[\w.-]+))?#(\d+)\b/i` or an explicit `https://github.com/<owner>/<repo>/(issues|pull)/<n>` URL. A bare `#123` no longer matches.
  - add a pure helper `server/src/modules/intent/link-parser.ts` — `parseBodyLinks(body, { owner, repo }): ParsedLink[]` with kinds `issue {owner, repo, number}`, `repoDoc {path, ref?}` (same-repo `github.com/<owner>/<repo>/blob/<ref>/<path>.md` or repo-relative `*.md` path), and `external {host, path}` (query/fragment stripped). Reject `..`, absolute paths and non-`.md` files. Only the PR's own repo counts as a blob URL; other repos' blobs → `external`.
- Change: adapter regex plus a pure parser. Never fetches.
- Acceptance: typecheck passes. A body containing only `see #12` yields no linked issue.
- Tests: none in this iteration (deferred to test-writer) · run: `cd server && npm run typecheck`
- Depends on: —

### S7 — Intent module: source resolver + service + container getter   [module: server] [skills: onion-architecture]
- Files:
  - create `server/src/modules/intent/source-resolver.ts` — `SourceResolver(container).collect(workspaceId, pull, repo, diff): { input: IntentInput; sources: IntentSource[]; missing: string[] }`. Title/description → sources. `issue` links → `container` GitHub client `getIssue` (`octokit.ts:351`). `repoDoc` → read the file at `pull.head_sha` via the same git client `loadDiff` uses (`diff-loader.ts:12`). `external` → `status: 'unavailable', reason: 'external host not fetched'`, never fetched. Any 404/timeout/permission error → `unavailable` with a short reason, never invented content. `files` → from `diff.files` (path, additions, deletions), with hunk headers rebuilt as `@@ -oldStart,oldLines +newStart,newLines @@` (no section heading, which `UnifiedDiff` doesn't carry). `ref` for logs is rebuilt from parsed parts (`owner/repo#N`, `path@ref`, `host/path`), never the raw URL.
  - create `server/src/modules/intent/service.ts` — `IntentService(container)`:
    - `get(workspaceId, prId): Promise<PrIntentRecord | null>` computes `stale = head_sha !== pull.head_sha`.
    - `ensureIntent(workspaceId, pull, repo, diff, logger?)`: an existing intent (stale or not) is reused with log `intent.reused`. If there is none, call `detect`. Any error → `logger.warn`, return `null` (never blocks the review).
    - `detect(workspaceId, pull, repo, diff, { force })` follows the template at `conventions/service.ts:107-150`: `resolveFeatureModel(container, workspaceId, 'review_intent')` (`settings/feature-models.ts:47`) → `createClassifierRun` → `SourceResolver.collect` → `classifyIntent(container.llm(provider), model, input)` → `computeConfidence` → `upsertIntent` → `finishClassifierRun` with a RunTrace whose PromptAssembly holds only stats. LLM failure → `ExternalServiceError`, run status `failed`.
    - In-process in-flight guard: a `Map<prId, Promise>` so concurrent detects for the same PR share one call.
    - Log event `intent.classify` (RunLogger + pino) on the classifier run: `{ provider, model, feature: 'review_intent', source: 'override'|'default', sources: [{kind, ref, status, chars}], prompt_sections: promptStats, est_tokens_in }`, then after the call `{ tokens_in, tokens_out, cost_usd, confidence, latency_ms }`. Never log body/issue/doc/diff text, headers or keys.
  - modify `server/src/platform/container.ts` — lazy memoized getter `get intent(): IntentService` following the `repoIntel` pattern (:126).
- Change: Application ring. Only reaches GitHub/git/LLM/DB through `container`.
- Acceptance: typecheck passes. No `new Octokit…`/`drizzle-orm` import in `modules/intent/`.
- Tests: none in this iteration (deferred to test-writer) · run: `cd server && npm run typecheck`
- Depends on: S3, S4, S6

### S8 — Intent routes   [module: server] [skills: fastify-best-practices, onion-architecture, zod]
- Files:
  - create `server/src/modules/intent/routes.ts` — `GET /pulls/:id/intent` → `PrIntentRecord`, or 404 when no intent exists. `POST /pulls/:id/intent` → loads pull/repo/diff via the service and calls `detect({ force: true })`, returns `PrIntentRecord`, with `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }` (as `reviews/routes.ts:29`). Both use `schema: { params: IdParams }` and `getContext(container, req)` for `workspaceId`, and scope the PR to the workspace.
  - modify `server/src/modules/index.ts:26-37` — register the intent plugin.
- Change: Transport only: validate → one service call → map status.
- Acceptance: typecheck passes. The route file imports no repository or adapter.
- Tests: none in this iteration (deferred to test-writer) · run: `cd server && npm run typecheck`
- Depends on: S7

### S9 — Wire intent into the review run   [module: server] [skills: onion-architecture]
- Files:
  - modify `server/src/modules/reviews/run-executor.ts` — in `executeRuns` (:56), right after the shared `loadDiff` (:99): `const intent = await this.container.intent.ensureIntent(workspaceId, pull, repo, diff, logger)`, once per review (matches the comments at :40,:53,:64). Pass it into `runOneAgent` (:140) → `reviewPullRequest({ ..., intent })` (:210-233). Set `PromptAssembly.intent` to the short summary in the RunTrace build (:244-274). Log `intent.injected { confidence, stale, in_scope_n, out_of_scope_n, filtered_n, kept_signal }` on each agent run. Findings carry `out_of_scope` into `persistRunOutcome` (:281).
- Change: Application ring. Classifier failure → `intent = null` → review runs exactly as today.
- Acceptance: typecheck passes. Existing server unit tests stay green. A review with no intent produces the same prompt as before.
- Tests: none in this iteration (deferred to test-writer) · run: `cd server && npm run typecheck && npx vitest run --exclude '**/*.it.test.ts'`
- Depends on: S5, S7

### S10 — Client data hooks   [module: client] [skills: frontend-architecture, react-best-practices]
- Files:
  - create `client/src/lib/hooks/intent.ts` — `usePrIntent(prId)` (TanStack query, a 404 maps to `null`) and `useRedetectIntent(prId)` (mutation POST, invalidates the intent query). `import type { PrIntentRecord } from '@devdigest/shared'`.
  - modify `client/src/lib/hooks/index.ts` (barrel) — export them. Follow the existing `lib/hooks/reviews.ts` pattern and `lib/api.ts`.
- Acceptance: `npm run typecheck` passes. No value import from `@devdigest/shared`.
- Tests: none in this iteration (deferred to test-writer) · run: `cd client && npm run typecheck`
- Depends on: S1, S8

### S11 — IntentCard on Overview   [module: client] [skills: next-best-practices, react-best-practices, frontend-architecture]
- Files:
  - create `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/{IntentCard.tsx,index.ts,styles.ts,constants.ts}` — header `INTENT` + confidence badge; quoted summary; two columns In scope / Out of scope; source chips (`Description ✓`, `Issue #12 ✓`, `docs/plans/x.md ✓`, `host/… ✕ unavailable`); a low-confidence banner; a missing-context banner; a stale badge; a `Re-detect` button (`Button kind="ghost" icon="RefreshCw"`) calling `useRedetectIntent`; an empty state with a `Detect intent` button; loading/error states. The component stays under 200 lines (split the source chips into `IntentSources/` if needed). CSS vars + `styles.ts`, no Tailwind.
  - create `client/messages/en/intent.json` — all copy (namespace `intent`, auto-loaded).
  - modify `OverviewTab/OverviewTab.tsx:7-22` — render `<IntentCard prId=… />` above the Description. Thread `prId` from `page.tsx:140` if it isn't already passed.
- Acceptance: typecheck + build pass. The card renders above the Description with all states driven by `PrIntentRecord`.
- Tests: none in this iteration (deferred to test-writer) · run: `cd client && npm run typecheck && npm run build`
- Depends on: S10

### S12 — "Outside PR scope" tag in FindingsTab   [module: client] [skills: react-best-practices, frontend-architecture]
- Files:
  - modify `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/*` — when `finding.out_of_scope` is true, render a tag with copy `intent.outsideScope` from `intent.json`.
- Acceptance: typecheck passes. Findings without the flag render unchanged.
- Tests: none in this iteration (deferred to test-writer) · run: `cd client && npm run typecheck && npm test`
- Depends on: S1, S11

## Contracts & DB
- Contracts: `contracts/brief.ts` (Intent rename + IntentSource/Confidence), `contracts/review-api.ts` (PrIntentRecord), `contracts/findings.ts` (`out_of_scope`), `contracts/trace.ts` (`PromptAssembly.intent`), `contracts/platform.ts` (`review_intent` default/label). Applied to BOTH `server/src/vendor/shared` and `client/src/vendor/shared`. Plus `client/src/lib/feature-models.ts`.
- DB: schema change in `server/src/db/schema/reviews.ts` (`pr_intent` new columns + CHECK + FK to `agent_runs`; `findings.out_of_scope`). Generate with `npx drizzle-kit generate < /dev/null`, hand-edit to be idempotent (`ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` before adds). **No `db:migrate` on the shared DB.**

## Verification
| Package | Command |
|---|---|
| reviewer-core | `cd reviewer-core && npm run typecheck && npm test` (incl. unchanged `test/prompt.test.ts`) |
| server (unit) | `cd server && npm run typecheck && npm test -- --exclude '**/*.it.test.ts'` (incl. unchanged `test/prompt-callers.test.ts`) and `npm run build` |
| server (integration, only if `docker info` succeeds) | `cd server && npx vitest run .it.test` |
| client | `cd client && npm run typecheck && npm test && npm run build` |
| manual 1 | Run a review on a PR with a meaningful body → Overview Intent card summary matches the PR goal |
| manual 2 | Run history shows a separate "Intent classifier" row with provider `openrouter` / model `anthropic/claude-haiku-5.5` (or the Settings override), distinct from the agent's model |
| manual 3 | The classifier trace / request contains file paths and `@@ … @@` headers only, no `+`/`-` diff lines |
| manual 4 | A PR body linking `docs/plans/<x>.md` (or a same-repo blob URL) → that ref appears in `sources` with `status: used`. A Notion link → `unavailable` + listed in missing context |
| manual 5 | Frontmatter of `.claude/agents/architecture-reviewer.md`, `plan-verifier.md`, `researcher.md` has `disallowedTools` containing Write and Edit (Bash-guard is tracked in `docs/agent-specs/read-only-bash-guard.md`) |
| manual 6 | The `intent.classify` log entry (run_traces.log / pino) shows provider/model/sources/prompt_sections/tokens/cost only: no body, issue, doc or diff text, no keys or auth headers, refs without query strings |

## Out of scope / handed off
- Architecture review → architecture-reviewer: `modules/intent/` layering (service ↔ `container.reviewRepo`, classifier-run repository methods), the container getter, run-executor wiring, reviewer-core purity of `src/intent/` and `review/scope.ts`, IntentCard placement/size.
- Security review → security reviewer: `link-parser.ts` / `source-resolver.ts` (SSRF: no non-GitHub fetches, cross-repo blob rejection, `..`/absolute path rejection), prompt injection via body/issue/docs (`wrapUntrusted`, one-signal rule), log redaction in `intent.classify`, rate limit + in-flight guard on `POST /pulls/:id/intent`, workspace scoping of both routes.
- Tests → test-writer: buildIntentPrompt (no diff lines, hunk headers, missing line), computeConfidence (3 levels), applyIntentScope (one signal, low mode), assemblePrompt intent section, server it-tests with recording `MockLLMProvider` (two calls/two models, no diff bodies, plan in prompt, unavailable → missing_context, log redaction, GET/POST routes), IntentCard RTL states.
- e2e: seed `pr_intent` for `acme/payments-api#482` + `e2e/specs/10-pr-intent.flow.json`. Deferred.

## Risks & open questions
- **Unverified (not read under the exploration budget):** the exact reviewer output schema used by `reviewPullRequest` (whether it derives from `Finding`, so `out_of_scope` reaches the model through strict json_schema); the `agent_runs` agent-name column name and the method `ReviewService.runReview` uses to insert rows (`service.ts:119-129`); whether `persistRunOutcome` can serve the classifier run without a review payload; where findings rows map back to `Finding`; how the GitHub client is exposed on `container` (getter name); the RunLogger API; whether `OverviewTab` already receives `prId`; the `FindingsTab` file layout; the name of the client `IdParams` / reviews hooks file. The implementer must confirm each at the cited anchor before editing.
- Renaming `Intent.intent` → `summary` also changes `PrBrief` (composes `Intent`, `brief.ts:6`). Any existing consumer or fixture of `PrBrief.intent` breaks at typecheck and must be updated. Confirm the rename is acceptable versus keeping `intent` in the contract.
- Existing server tests that exercise `executeRuns` with `MockLLMProvider` (`adapters/mocks.ts:58`) will now trigger an extra classifier call. The design makes failures non-blocking, but tests that assert LLM call counts or the order of mock responses may break. If so, the fix is a `ContainerOverrides` stub for `intent`, which is a test change that conflicts with "no new tests". The human should decide.
- `UnifiedDiff` hunks have no section heading text, so hunk headers are rebuilt from line numbers only. Parsing headings from the raw diff is deferred.
- Repo-relative docs are read via the same git client as `loadDiff`. Per server INSIGHTS this fails when `repos.clone_path` belongs to another checkout. The design's GitHub contents-API fallback is not planned because no such adapter method was verified. Confirm whether it's needed.
- The `anthropic/claude-haiku-5.5` id and pricing come from the caller (OpenRouter, 2026-10-16), not checked by the planner. `openrouter.ts` only supports `completeStructured` with strict json_schema (`:75-76`), which `classifyIntent` uses.
- The in-flight guard is per process only. Multiple API instances could double-classify (last-write-wins upsert).
- Low-confidence intents are still injected into the review prompt. Confirm that, rather than omitting the section on `low`.
