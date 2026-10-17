# Plan: Add Smart Diff to the Files changed tab (role groups + findings overlay)

Status: draft · Date: 2026-10-16 · Modules: server, client

## Goal
The **Files changed** tab groups the PR's files by role in the fixed order **core → tests → wiring → docs → boilerplate**. Each group has a header with its label, hint, file count and the number of files with findings. `docs` and `boilerplate` files start collapsed. A **Smart order / Original order** toggle (Smart is the default) switches back to today's flat GitHub order. Findings from the **latest review per agent** are overlaid on the diff in three places: the group header counter, a dot in the file header, and a `FindingCard` under the matching new-file line. Findings whose line isn't in the patch appear in a small list under the file, so none are dropped. A pure, HTTP-free `classifyFile(path)` in `server/src/modules/smart-diff/` decides the role. L08 will reuse it as a pre-prompt filter.

## Non-goals
- Any change to the **Agent runs** tab (`FindingsTab/`, `FindingsPanel/`, `ReviewRunAccordion/`, `RunHistory/`, `RunStatus/`). `FindingCard/` is reused as-is, not modified.
- Real PR split suggestions. `split_suggestion` is always `{ too_big: false, total_lines, proposed_splits: [] }`, and no "large PR" banner is rendered.
- `pseudocode_summary` (always `null`), repo-intel ranks, LLM calls of any kind.
- DB schema or migrations.
- Server integration tests (`*.it.test.ts`) for the new route, and e2e specs.
- Using the classifier inside the review prompt (that's L08).

## Context
- INSIGHTS applied:
  - server — `vendor/shared` is a hand-copied duplicate with no sync script (`server/INSIGHTS.md:18`) → S2 edits `contracts/brief.ts` in **both** `server/src/vendor/shared` and `client/src/vendor/shared`, and S2 acceptance checks the two lines are identical.
  - server — shared dev Postgres drift / no `db:migrate` (`server/INSIGHTS.md:34-38`) → not triggered: the plan has no schema change, so no `db:generate` or migration.
  - server — `agent_runs` rows can be agent-less (the intent classifier, `agent_id` NULL) (`server/INSIGHTS.md:22`) → `latestPerAgent` keys on `agentId` and treats `null` as one key. The classifier writes no `reviews` row (unverified, see Risks), so this mostly affects summary reviews.
  - client — value imports from `@devdigest/shared` break only the Next bundler (`client/INSIGHTS.md:26-27`) → every client file uses `import type` only. The runtime role list is restated in `DiffTab/constants.ts`, typed `readonly SmartDiffRole[]`.
- Constraints applied:
  - The classifier is pure → `constants.ts`, `classify.ts` and `build.ts` in `modules/smart-diff/` import nothing from `fastify`, `platform/container`, `drizzle-orm` or `db/`. Only `service.ts` touches the container and only `routes.ts` touches Fastify. Checked by a `git grep` row in Verification.
  - Server onion → `routes.ts` (IdParams + `getContext` + one service call) → `service.ts` (reaches the DB only through `container.reviewRepo`) → `ReviewRepository`. No new repository: all three reads already exist (`server/src/modules/reviews/repository.ts:30,38,63`). The service is constructed once in `routes.ts` (`new SmartDiffService(container)`), as reviews/agents/pulls do (`server/src/modules/reviews/routes.ts:22`). No container getter: the service is stateless, unlike `IntentService`, which owns an in-flight guard (`server/src/platform/container.ts:101-104`).
  - Shared contracts duplicated → S2 applies the same edit to both copies.
  - Client `import type` only → see INSIGHTS above.
  - Layer direction on the client → `components/diff-viewer` must not import from `app/**/_components`. `FindingCard` (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx:26`) is injected from `DiffTab` as a render-prop on `DiffFindingApi`, and diff-viewer only calls `findings.render(f)`. The render-prop returns a `<FindingCard … />` element, a real component, so this isn't the "render factory" anti-pattern from `react-best-practices`.
  - Client styling → CSS variables plus inline styles. New styles go in `components/diff-viewer/styles.ts` / `comments.ts` `cs` (existing pattern) and `DiffTab/styles.ts`. No Tailwind. All copy goes in `client/messages/en/prReview.json` (`smartDiff`) or `client/messages/en/shell.json` (`diffViewer`, the diff-viewer's own namespace, `client/src/components/diff-viewer/OutdatedComments/OutdatedComments.tsx:11`). Namespaces are auto-loaded by filename (`client/src/i18n/request.ts:16-25`).
  - Business rules live server-side → role classification is server-only, and the client only renders `SmartDiff.groups`. The one exception the user confirmed is the **latest review per agent** rule: the client restates it to choose which `FindingRecord`s to render inline. It's a pure helper with its own test, and the server applies the same rule for `finding_lines`.
  - Tests follow TESTING.md / `react-testing-library` → one table-driven unit test for the classifier, one unit test for `buildSmartDiff`/`latestPerAgent`, one client helper unit test, and RTL flow tests on `DiffViewer` (user-visible text/roles, `userEvent`, no implementation assertions).
- Reuse:
  - `ReviewRepository.getPull(workspaceId, prId)` `server/src/modules/reviews/repository.ts:30`, `getPrFiles(prId)` :38 (`pr_files`: `path`, `additions`, `deletions`, `patch` — `server/src/db/schema/pulls.ts:36-48`), `reviewsForPull(prId)` :63 (newest first, `createdAt desc` — `server/src/modules/reviews/repository/review.repo.ts:61-69`; each item `{ review, findings: FindingRow[] }`, `FindingRow.startLine` from `server/src/db/schema/reviews.ts:52`, `review.agentId` :22, `review.createdAt` :35).
  - Route pattern: `server/src/modules/intent/routes.ts:12-21` (`withTypeProvider<ZodTypeProvider>()`, `schema: { params: IdParams }`, `getContext(container, req)`). `NotFoundError` from `server/src/platform/errors.js` (used in `server/src/modules/intent/service.ts:6,34`).
  - Module registry: `server/src/modules/index.ts:12,27-39`.
  - Contract: `SmartDiffRole` `server/src/vendor/shared/contracts/brief.ts:107` (+ client copy, same line). `SmartDiffFile` :110-116, `SmartDiffGroup` :119-122, `SmartDiff` :131-138. `SmartDiffResponse = SmartDiff` `contracts/review-api.ts:77`. `FindingRecord` `review-api.ts:15`, `ReviewRecord` :23 (`agent_id` :26 nullable, `created_at` :35).
  - Client: `usePrReviews(prId)` `client/src/lib/hooks/reviews.ts:51` (queryKey `["reviews", prId]`), `useFindingAction()` :139, `useDeleteRun` :60, `useDeleteReview` :81, `api.get` (`client/src/lib/api.ts`). FindingCard usage pattern `FindingsPanel.tsx:62-70` (`onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}`).
  - Diff viewer: `parsePatch` / `Line` `client/src/components/diff-viewer/helpers.ts:4-38`, `keysForLine` `comments.ts:63`, `DiffCommentApi` `comments.ts:9`, `cs` styles `comments.ts:109` (`thread` :133, `outdatedWrap`/`outdatedTitle` used by `OutdatedComments.tsx:15-16`), `AUTO_EXPAND_MAX_LINES` `constants.ts:4`, `FileCard` initial-open rule `FileCard.tsx:35-37`, `threadsForLine` pattern `FileCard.tsx:23-31`, `DiffViewer` `DiffViewer.tsx:14-32`, public barrel `diff-viewer/index.ts`.
  - Page wiring: `refetchReviews` in `onRunDone` `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:43,168-172`. `DiffTab` render :176-183. `qc` (`useQueryClient`) :47.
  - Existing copy: `prReview.json` `smartDiff` block `client/messages/en/prReview.json:53-62` (`coreLabel`, `wiringLabel`, `boilerplateLabel`, `filesCount: "{count} files"` already exist). `shell.json` `diffViewer` :33-43.
  - Existing tests to extend/follow: `client/src/components/diff-viewer/DiffViewer/DiffViewer.test.tsx` (render with `NextIntlClientProvider` + `shell` messages), `server/test/reviews-helpers.test.ts` (pure-helper unit style). Vitest includes: server `test/**/*.test.ts` (`server/vitest.config.ts:14`), client `src/**/*.test.{ts,tsx}` (`client/vitest.config.ts:18`).

## Skills per module
| Module / zone | Skills (from routing table) |
|---|---|
| shared contracts (both copies) | zod, typescript-expert |
| server smart-diff domain (constants, classify, build) | onion-architecture, typescript-expert |
| server service + DI | onion-architecture |
| server routes | fastify-best-practices, onion-architecture, zod |
| client components / hooks / route `_components` | next-best-practices, react-best-practices, frontend-architecture |
| client tests | react-testing-library |
| any module | engineering-insights |

## Steps

### S1 — Classifier test table first (red)   [module: server] [skills: typescript-expert, engineering-insights]
- Files:
  - create `server/test/smart-diff-classify.test.ts`
- Change: one `it.each` table `[path, expectedRole]` importing `classifyFile` from `../src/modules/smart-diff/classify.js` (the module doesn't exist yet, so the suite is red). Use one row per pattern plus the order cases:
  - **required order/edge cases:** `src/__tests__/__snapshots__/x.snap` → `boilerplate`; `.claude/skills/security/SKILL.md` → `wiring`; `e2e/README.md` → `tests`; `package-lock.json` → `boilerplate`; `src/middleware/ratelimit.ts` → `core`.
  - boilerplate: `Cargo.lock` (`*.lock`), `pnpm-lock.yaml`, `client/package-lock.json`, `yarn.lock`, `dist/main.js` (`dist/**`), `build/out.css` (`build/**`), `src/__snapshots__/data.json` (`**/__snapshots__/**`), `fixtures/output.snap` (`*.snap`), `src/api.generated.ts` (`*.generated.*`), `public/vendor.min.js` (`*.min.js`), `dist/index.js` (boilerplate beats the wiring barrel).
  - tests: `src/a.test.ts`, `src/Button.test.tsx`, `src/db.it.test.ts`, `src/a.spec.ts`, `server/test/helpers/db.ts` (`**/test/**`), `pkg/tests/fixture.json` (`**/tests/**`), `src/__tests__/util.ts` (`**/__tests__/**`), `e2e/specs/flow.json` (`e2e/**`), `src/index.test.ts` (tests beats the wiring barrel).
  - wiring: `src/modules/index.ts`, `lib/index.js`, `vitest.config.ts` (`*.config.*`), `tsconfig.build.json`, `.eslintrc.json`, `.env.example`, `docker-compose.dev.yml`, `.github/workflows/ci.yml`, `.github/README.md` (wiring beats docs).
  - docs: `notes/guide.md` (`**/*.md`), `docs/diagram.png` (`docs/**`), `README` and `server/README.rst` (`README*`), `CHANGELOG.txt` (`CHANGELOG*`), `LICENSE`.
  - core: `server/src/modules/smart-diff/service.ts`, `client/src/app/page.tsx`.
- Acceptance: the file exists and the run fails only because `classify.js` is missing (red before S3).
- Tests: this file · run: `cd server && npx vitest run test/smart-diff-classify.test.ts --reporter=dot 2>&1 | tail -n 20` → expect failure (module not found)
- Depends on: —

### S2 — Widen `SmartDiffRole` to 5 values (both copies)   [module: server + client vendor/shared] [skills: zod, typescript-expert]
- Files:
  - modify `server/src/vendor/shared/contracts/brief.ts:107` → `export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);`
  - modify `client/src/vendor/shared/contracts/brief.ts:107`, the identical edit.
- Change: contract only. `SmartDiffFile`, `SmartDiffGroup`, `SmartDiff` and `SmartDiffResponse` are unchanged. The enum order here is the display order.
- Acceptance: both packages typecheck. `git grep -n "SmartDiffRole = z.enum" -- server/src/vendor client/src/vendor` shows two identical lines.
- Tests: none (contract-only) · run: `cd server && npm run typecheck`; `cd client && npm run typecheck`
- Depends on: —

### S3 — Pure classifier: `constants.ts` + `classify.ts`   [module: server] [skills: onion-architecture, typescript-expert]
- Files:
  - create `server/src/modules/smart-diff/constants.ts`
  - create `server/src/modules/smart-diff/classify.ts`
- Change (domain ring, zero IO, no glob dependency):
  - `constants.ts`: `export const SMART_DIFF_ROLE_ORDER = ['core','tests','wiring','docs','boilerplate'] as const satisfies readonly SmartDiffRole[]` (display order), `COLLAPSED_ROLES` isn't needed server-side. `export interface ClassifyRule { role: SmartDiffRole; test: (p: NormalizedPath) => boolean }`, `NormalizedPath = { segments: string[]; dirs: string[]; base: string }` (all lower-cased), and `export const CLASSIFY_RULES: readonly ClassifyRule[]` in **match order boilerplate → tests → wiring → docs**. `core` is the fallback, not a rule. `import type { SmartDiffRole } from '@devdigest/shared'`.
  - Pattern semantics, hand-written predicates/regexes. A pattern with a leading directory and no `**/` (`dist/**`, `build/**`, `e2e/**`, `docs/**`, `.github/**`, `.claude/**`) is **anchored at the repo root** (`segments[0]`). `**/<dir>/**` matches any directory segment (`dirs`, excluding the basename). Basename patterns (`*.lock`, `index.ts`, `README*`, …) match at any depth.
    - boilerplate: `base.endsWith('.lock')`; `base ∈ {pnpm-lock.yaml, package-lock.json, yarn.lock}`; `segments[0] ∈ {dist, build}`; `dirs.includes('__snapshots__')`; `base.endsWith('.snap')`; `/\.generated\./.test(base)`; `base.endsWith('.min.js')`.
    - tests: `/\.test\.tsx?$/` (covers `.it.test.ts`); `/\.spec\.ts$/`; `dirs ∩ {test, tests, __tests__}`; `segments[0] === 'e2e'`.
    - wiring: `base ∈ {index.ts, index.js}`; `/\.config\./`; `/^tsconfig.*\.json$/`; `base.startsWith('.eslintrc')`; `base.startsWith('.env')`; `/^docker-compose.*\.yml$/`; `segments[0] ∈ {.github, .claude}`.
    - docs: `base.endsWith('.md')`; `segments[0] === 'docs'`; `base.startsWith('readme')`; `base.startsWith('changelog')`; `base === 'license'`.
  - `classify.ts`: `export function normalizePath(path: string): NormalizedPath` (backslashes → `/`, strip a leading `./` and `/`, lower-case, split, drop empty segments) and `export function classifyFile(path: string): SmartDiffRole`, which takes the first `CLASSIFY_RULES` match, else `'core'`. The only imports are `./constants.js` and `import type` from `@devdigest/shared`.
- Acceptance: S1 is green. `git grep -nE "fastify|container|drizzle|db/" -- server/src/modules/smart-diff/classify.ts server/src/modules/smart-diff/constants.ts` → no match.
- Tests: `server/test/smart-diff-classify.test.ts` (S1) · run: `cd server && npx vitest run test/smart-diff-classify.test.ts --reporter=dot 2>&1 | tail -n 20`
- Depends on: S1, S2

### S4 — Pure assembly: `latestPerAgent` + `buildSmartDiff`   [module: server] [skills: onion-architecture, typescript-expert]
- Files:
  - create `server/src/modules/smart-diff/build.ts`
  - create `server/test/smart-diff-build.test.ts`
- Change (domain ring, plain input shapes, no Drizzle row types):
  - `export interface SmartDiffInputFile { path: string; additions: number; deletions: number }`, `export interface SmartDiffInputFinding { file: string; startLine: number }`, `export interface SmartDiffInputReview { agentId: string | null; createdAt: Date; findings: SmartDiffInputFinding[] }`.
  - `export function latestPerAgent<R extends { agentId: string | null; createdAt: Date }>(reviews: R[]): R[]` keeps the newest `createdAt` per `agentId`. `null` counts as one key. It does **not** rely on input order.
  - `export function buildSmartDiff(files: SmartDiffInputFile[], findings: SmartDiffInputFinding[]): SmartDiff`:
    - `finding_lines` per path = unique `startLine` values, sorted ascending, from findings whose `file === path` (`[]` when none);
    - groups in `SMART_DIFF_ROLE_ORDER`, using `classifyFile(path)`. Empty groups are omitted, and files keep their input order within a group;
    - each file is `{ path, pseudocode_summary: null, additions, deletions, finding_lines }`;
    - `split_suggestion = { too_big: false, total_lines: Σ(additions + deletions), proposed_splits: [] }`.
- Acceptance: unit test green. `build.ts` imports only `./classify.js`, `./constants.js` and `import type` from `@devdigest/shared`.
- Tests: `server/test/smart-diff-build.test.ts`. (1) Happy path: files `[src/a.ts, package-lock.json, README.md, src/a.test.ts, src/b.ts]` → group roles exactly `['core','tests','docs','boilerplate']` (no `wiring`), core files `[src/a.ts, src/b.ts]` in input order, `total_lines` = sum, `too_big: false`, `proposed_splits: []`, and findings `[{file:'src/a.ts',startLine:12},{file:'src/a.ts',startLine:3},{file:'src/a.ts',startLine:12}]` → `finding_lines [3,12]`. (2) `latestPerAgent`: two reviews for agent A (older/newer, given in ascending order) plus one for agent B → returns A-newer and B. The result is also parsed with `SmartDiff.parse(...)` from `@devdigest/shared` to prove it conforms to the contract. · run: `cd server && npx vitest run test/smart-diff-build.test.ts --reporter=dot 2>&1 | tail -n 20`
- Depends on: S3

### S5 — `SmartDiffService` + `GET /pulls/:id/smart-diff` + registration   [module: server] [skills: fastify-best-practices, onion-architecture, zod]
- Files:
  - create `server/src/modules/smart-diff/service.ts`
  - create `server/src/modules/smart-diff/routes.ts`
  - modify `server/src/modules/index.ts:12,27-39`: `import smartDiff from './smart-diff/routes.js';` plus a `smartDiff` entry.
- Change:
  - `service.ts` (application ring): `export class SmartDiffService { constructor(private container: Container) {} async get(workspaceId: string, prId: string): Promise<SmartDiffResponse> }`. It reads `const repo = this.container.reviewRepo`, then `repo.getPull(workspaceId, prId)` and throws `NotFoundError('Pull request not found')` when that's missing (workspace scoping). It loads `getPrFiles` and `reviewsForPull` in `Promise.all`, maps each review to `{ agentId: review.agentId, createdAt: review.createdAt, findings: findings.map(f => ({ file: f.file, startLine: f.startLine })) }`, applies `latestPerAgent`, flattens the findings, and returns `buildSmartDiff(files, findings)`. Imports: `Container` type, `NotFoundError`, `./build.js`, `import type` from `@devdigest/shared`. No `drizzle-orm`, no `fastify`.
  - `routes.ts` (transport): `export default async function smartDiffRoutes(appBase: FastifyInstance)` mirrors `intent/routes.ts:12-21`. It constructs `const service = new SmartDiffService(container)` once, then `app.get('/pulls/:id/smart-diff', { schema: { params: IdParams } }, async (req) => { const { workspaceId } = await getContext(container, req); return service.get(workspaceId, req.params.id); })`.
- Acceptance: server typecheck passes. `routes.ts` imports no repository/adapter/drizzle. `test/routes-smoke.test.ts` stays green. `git grep -n "drizzle-orm\|fastify" -- server/src/modules/smart-diff/service.ts server/src/modules/smart-diff/build.ts` → no match.
- Tests: no new test (route is a thin pass-through; logic covered by S4) · run: `cd server && npm run typecheck && npx vitest run --exclude '**/*.it.test.ts' --reporter=dot 2>&1 | tail -n 40`
- Depends on: S4

### S6 — Client copy, `useSmartDiff` hook, cache invalidation   [module: client] [skills: frontend-architecture, react-best-practices, next-best-practices]
- Files:
  - modify `client/messages/en/prReview.json` `smartDiff` (:53-62). Keep the existing keys and add `testsLabel: "Tests"`, `docsLabel: "Docs"`, `coreHint: "The substance of the change — review closely"`, `testsHint: "Tests that exercise the change"`, `wiringHint: "Config, barrels and plumbing"`, `docsHint: "Documentation — skim"`, `boilerplateHint: "Generated files and lock-files — usually safe to skip"`, `smartOrder: "Smart order"`, `originalOrder: "Original order"`, `orderToggleLabel: "File order"`, `filesWithFindings: "{count} with findings"`.
  - modify `client/messages/en/shell.json` `diffViewer` (:33-43). Add `findingsNotInDiff: "{count} finding(s) on lines outside this diff"` and `fileHasFindings: "{count} finding(s) in this file"` (aria-label/title of the dot).
  - modify `client/src/lib/hooks/reviews.ts`. Add `export function useSmartDiff(prId: string | null | undefined)` → `useQuery({ queryKey: ["smart-diff", prId], queryFn: () => api.get<SmartDiffResponse>(\`/pulls/${prId}/smart-diff\`), enabled: !!prId })`, with `SmartDiffResponse` added to the existing `import type` block (:9-16). In `useDeleteRun.onSuccess` (:66-69) and `useDeleteReview.onSuccess` (:85), also `invalidateQueries({ queryKey: ["smart-diff", prId] })`.
  - modify `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`. In `onRunDone` (:168-172), add `if (prId) qc.invalidateQueries({ queryKey: ["smart-diff", prId] });` next to `refetchReviews()`. Pass `repoFullName={repoFullName}` and `headSha={pr.head_sha}` to `<DiffTab>` (:177-182); both values are already used for `FindingsTab` at :158-159.
- Acceptance: client typecheck passes. `git grep -n '"smart-diff"' -- client/src` shows the query key plus the 3 invalidations. No value import from `@devdigest/shared`. `FindingsTab` props are unchanged.
- Tests: none for the hook (thin query wrapper, covered via the DiffTab helpers + manual) · run: `cd client && npm run typecheck`
- Depends on: S2, S5

### S7 — diff-viewer: findings overlay, `FileGroup`, grouped `DiffViewer`   [module: client] [skills: react-best-practices, frontend-architecture, react-testing-library]
- Files:
  - create `client/src/components/diff-viewer/findings.ts`, which holds:
    - `export interface DiffFindingApi { byPath: ReadonlyMap<string, FindingRecord[]>; render: (f: FindingRecord) => React.ReactNode }` (`import type { FindingRecord } from "@devdigest/shared"`);
    - `export function partitionFindings(list: FindingRecord[], lines: Line[]): { byLine: Map<string, FindingRecord[]>; offPatch: FindingRecord[] }`, keyed by the RIGHT key of the line whose `newNo === f.start_line` (findings refer to the new file). It builds the key the same way `keysForLine` does (`comments.ts:63-66`); export `lineKey` from `comments.ts` if it isn't exported yet;
    - `export function findingsForLine(ln: Line, byLine: Map<string, FindingRecord[]>): FindingRecord[]`, which looks up the entries of `keysForLine(ln)`, mirroring `threadsForLine` (`FileCard.tsx:23-31`).
  - create `client/src/components/diff-viewer/FileGroup/{FileGroup.tsx,index.ts}`. It's a presentational header plus children: a colour square (`group.color`), `group.label`, `group.hint`, and `group.meta` on the right, all strings supplied by the caller. It uses `<section aria-label={group.label}>` and a heading element for the label, so tests can query it by role.
  - create `client/src/components/diff-viewer/FindingsNotInDiff/{FindingsNotInDiff.tsx,index.ts}`. Modelled on `OutdatedComments.tsx:10-19` (`cs.outdatedWrap`/`cs.outdatedTitle`), its title is `t("diffViewer.findingsNotInDiff", { count })` and it renders `findings.render(f)` for each finding.
  - modify `client/src/components/diff-viewer/CodeLine/CodeLine.tsx`. New optional prop `findings?: { list: FindingRecord[]; render: DiffFindingApi["render"] }`. Under the comment threads (:67-71), render `list.map(f => <div key={f.id} style={cs.thread}>{render(f)}</div>)`. These cards always show (they aren't gated by `showComments`).
  - modify `client/src/components/diff-viewer/FileCard/FileCard.tsx`. New optional props `findings?: DiffFindingApi` and `defaultOpen?: boolean`. Initial open state is `defaultOpen ?? ((additions + deletions) <= AUTO_EXPAND_MAX_LINES)` (:35-37). `fileFindings = findings?.byPath.get(file.path) ?? []`, and `partitionFindings` runs in a `useMemo` over `[fileFindings, lines]`. When `fileFindings.length > 0`, a red dot `<span role="img" aria-label={t("diffViewer.fileHasFindings", { count })} title=… style={s.findingDot} />` goes after the path (:60-62). Pass `findings` to each `CodeLine`. After the lines, render `<FindingsNotInDiff>` when `offPatch.length > 0`. Keep the file under 200 lines.
  - modify `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx`. New optional props `groups?: DiffFileGroup[]` and `findings?: DiffFindingApi`, where `export interface DiffFileGroup { id: string; label: string; hint: string; meta: string; color: string; files: PrFile[]; defaultOpen?: boolean }` (in `findings.ts` or a colocated `types.ts`). With `groups`, render `<FileGroup key={g.id}>` with `<FileCard key={f.path} … defaultOpen={g.defaultOpen} />` inside. Without `groups`, render today's flat list (unchanged path). Keep `key={f.path}` (F12 regression guard).
  - modify `client/src/components/diff-viewer/styles.ts`: add `findingDot` (8px circle, `background: var(--…)` danger token, see Risks) and the `FileGroup` header styles.
  - modify `client/src/components/diff-viewer/index.ts`: export the types `DiffFindingApi` and `DiffFileGroup`.
- Change: presentational only. No `app/**` import, no data fetching, and no role knowledge in diff-viewer (labels, colours and `defaultOpen` come from the caller).
- Acceptance: typecheck passes. `git grep -n "_components\|lib/hooks" -- client/src/components/diff-viewer` → no match. The existing 3 `DiffViewer` tests stay green.
- Tests: extend `client/src/components/diff-viewer/DiffViewer/DiffViewer.test.tsx` (same `NextIntlClientProvider` + `shell` messages helper; `userEvent.setup()`; stub `render: (f) => <div>{\`card: ${f.title}\`}</div>`):
  1. **Grouped flow.** Groups `Core` (`src/a.ts`) → `Docs` (`README.md`, `defaultOpen: false`) → `Boilerplate` (`package-lock.json`, `defaultOpen: false`) render as sections in that order (`getAllByRole("region")` / headings) with their `meta` text. Core's line content is visible. The README's line content isn't visible until the user clicks its file header, and then it is.
  2. **Findings overlay.** `src/a.ts` with patch `@@ -1,1 +1,2 @@\n const a = 1;\n+const b = 2;` and findings `{start_line: 2, title: "on-line"}` + `{start_line: 40, title: "off-patch"}`. The dot (`getByRole("img", { name: /2 finding/ })`) is present. `card: on-line` sits inside the same row container as `const b = 2;`: assert via `within(screen.getByText("const b = 2;").closest(...))`, or simply assert that `card: on-line` appears after the line text in document order. `card: off-patch` appears under the "outside this diff" title.
  3. **Original order.** Same files passed as flat `files` without `groups` → no group headings and file paths in input order.
  · run: `cd client && npx vitest run src/components/diff-viewer --reporter=dot 2>&1 | tail -n 40`
- Depends on: S6

### S8 — DiffTab: smart/original toggle, groups, injected FindingCard   [module: client] [skills: next-best-practices, react-best-practices, frontend-architecture, react-testing-library]
- Files:
  - create `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/constants.ts`: `SMART_DIFF_ROLES: readonly SmartDiffRole[] = ["core","tests","wiring","docs","boilerplate"]` (local restatement per `client/INSIGHTS.md`), `COLLAPSED_ROLES: ReadonlySet<SmartDiffRole> = new Set(["docs","boilerplate"])`, `ROLE_COLOR: Record<SmartDiffRole, string>` (CSS vars), and the `ROLE_LABEL_KEY` / `ROLE_HINT_KEY` maps → the `smartDiff.*` keys.
  - create `.../DiffTab/helpers.ts` (pure):
    - `latestPerAgent(reviews: ReviewRecord[]): ReviewRecord[]` keeps the newest `created_at` per `agent_id`. `null` is one key, and it doesn't rely on input order. This is the same rule as server S4;
    - `findingsByPath(reviews: ReviewRecord[]): Map<string, FindingRecord[]>` flattens `latestPerAgent(reviews)` findings by `file`;
    - `toViewerGroups(smart: SmartDiff, files: PrFile[], byPath: ReadonlyMap<string, FindingRecord[]>): { role: SmartDiffRole; files: PrFile[]; withFindings: number }[]` maps each group's paths to the `PrFile` from `files` (for `patch`), skipping paths not in `files`. Any `files` entry absent from every group is appended to `core` (created if missing, placed first), so no file is hidden. `withFindings` = number of the group's files with ≥1 entry in `byPath`.
  - create `.../DiffTab/helpers.test.ts`. (1) `latestPerAgent` + `findingsByPath`: agent A old/new (old one listed first) + agent B → only A-new and B findings are mapped. (2) `toViewerGroups`: role order is preserved, `patch` is taken from `files`, an unlisted file lands in `core`, and `withFindings` counts files rather than findings.
  - create `.../DiffTab/OrderToggle.tsx`: two `Button`s (`@devdigest/ui`, `kind` ghost/secondary depending on the selected state; confirm the available `kind` values in `src/vendor/ui`) inside `role="group" aria-label={t("smartDiff.orderToggleLabel")}`, with `aria-pressed` on each, labels `smartOrder` / `originalOrder`.
  - create `.../DiffTab/styles.ts` if more than a couple of style objects are needed.
  - modify `.../DiffTab/DiffTab.tsx` (:10-65). New optional props are `repoFullName?: string | null` and `headSha?: string | null`. It adds `usePrReviews(prId)`, `useSmartDiff(prId)`, `useFindingAction()` and `useTranslations("prReview")`, plus local state `order: "smart" | "original"` defaulting to `"smart"`. `const byPath = findingsByPath(reviews ?? [])`. `findings: DiffFindingApi = { byPath, render: (f) => <FindingCard f={f} pending={action.isPending} repoFullName={repoFullName} headSha={headSha} onAction={(act) => action.mutate({ findingId: f.id, action: act, prId: prId ?? undefined })} /> }`, the same call shape as `FindingsPanel.tsx:62-70`. In smart mode with `smart.data` present, `groups = toViewerGroups(...).map(g => ({ id: g.role, label: t(ROLE_LABEL_KEY[g.role]), hint: t(ROLE_HINT_KEY[g.role]), meta: t("smartDiff.filesCount", { count: g.files.length }) + (g.withFindings > 0 ? " · " + t("smartDiff.filesWithFindings", { count: g.withFindings }) : ""), color: ROLE_COLOR[g.role], files: g.files, defaultOpen: COLLAPSED_ROLES.has(g.role) ? false : undefined }))`. In original mode, or while smart-diff is loading or errored, it passes the flat `files` (today's order). `<OrderToggle>` goes into the `SectionLabel` `right` slot next to the existing Show/Hide comments button (:47-58). `findings` and `commenting` are both passed to `DiffViewer`. Keep `DiffTab.tsx` under 200 lines.
- Change: route-level container (owns data and state); diff-viewer stays presentational.
- Acceptance: typecheck passes. Smart mode is the default and shows the groups. Toggling Original shows the flat GitHub order. FindingCards appear only from the latest review per agent. `git diff --stat` shows no change under `FindingsTab/`, `FindingsPanel/`, `FindingCard/`, `ReviewRunAccordion/`, `RunHistory/`, `RunStatus/`.
- Tests: `.../DiffTab/helpers.test.ts` (above) · run: `cd client && npx vitest run "src/app/repos" --reporter=dot 2>&1 | tail -n 40` then `cd client && npm run typecheck && npm test 2>&1 | tail -n 40`
- Depends on: S6, S7

## Contracts & DB
- Contracts: `contracts/brief.ts` `SmartDiffRole` widened to `['core','tests','wiring','docs','boilerplate']`, applied identically to `server/src/vendor/shared/contracts/brief.ts:107` **and** `client/src/vendor/shared/contracts/brief.ts:107`. `SmartDiffResponse` (`review-api.ts:77`) is unchanged.
- DB: none.

## Verification
| Package | Command |
|---|---|
| server (unit) | `cd server && npm run typecheck && npx vitest run --exclude '**/*.it.test.ts' --reporter=dot 2>&1 \| tail -n 40` (includes `smart-diff-classify`, `smart-diff-build`, unchanged `routes-smoke`) |
| client | `cd client && npm run typecheck && npm test 2>&1 \| tail -n 40` (includes extended `DiffViewer.test.tsx`, new `DiffTab/helpers.test.ts`) |
| check — classifier purity | `git grep -nE "fastify\|platform/container\|drizzle\|db/" -- server/src/modules/smart-diff/constants.ts server/src/modules/smart-diff/classify.ts server/src/modules/smart-diff/build.ts` → no match |
| check — thin route | `git grep -nE "repository\|adapters/\|drizzle" -- server/src/modules/smart-diff/routes.ts` → no match |
| check — contracts in sync | `git grep -n "SmartDiffRole = z.enum" -- server/src/vendor client/src/vendor` → 2 identical lines with 5 roles |
| check — layer direction | `git grep -nE "_components\|lib/hooks" -- client/src/components/diff-viewer` → no match |
| check — no value import | `git grep -nE "^import \{" -- client/src \| grep "@devdigest/shared"` → no match |
| check — Agent runs tab unchanged | `git diff --stat main -- "client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab" "client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel" "client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard" "client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion" "client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory"` → empty |
| manual 1 | Open a PR → Files changed: groups appear in order core → tests → wiring → docs → boilerplate with "N files". Docs and boilerplate files are collapsed. A lock-file sits under Boilerplate |
| manual 2 | Run review → when the run finishes (no reload), group headers show "· K with findings", files have a red dot, and expanding a file shows the FindingCard under its start line. Off-patch findings are listed under the file |
| manual 3 | Toggle Original order → flat list identical to the previous GitHub order. Toggle back → groups |
| manual 4 | Agent runs tab looks and behaves exactly as before |

## Out of scope / handed off
- Architecture review → architecture-reviewer: purity of `modules/smart-diff/{constants,classify,build}.ts` (L08 reuse), service-constructed-in-routes vs container getter, the client render-prop seam (`DiffFindingApi.render`), keeping `components/diff-viewer` free of `app/` imports, and the duplicated `latestPerAgent` rule (server + client).
- Security review → security reviewer: low surface. Check workspace scoping of `GET /pulls/:id/smart-diff` (`getPull(workspaceId, prId)` → 404) and that finding text rendered inline goes through the existing `FindingCard` (no new HTML/markdown rendering).
- e2e: none added. A recommended future flow is Files changed → groups visible → toggle Original.

## Risks & open questions
- **Root-anchored vs any-depth directory patterns.** Following the literal globs, `dist/**`, `build/**`, `e2e/**`, `docs/**`, `.github/**` and `.claude/**` match only at the repo root. In this multi-package repo, `server/dist/x.js` would therefore classify as **core**, and `client/docs/x.png` as core. Confirm literal semantics or switch these to any-depth (`dirs.includes(...)`). Switching would also make `src/build/helper.ts` boilerplate.
- **Literal `*.spec.ts`** does not cover `*.spec.tsx`/`*.spec.js`, and `index.ts`/`index.js` don't cover `index.tsx`. These follow the user's list as given.
- **Order of `pr_files`.** Neither `getPrFiles` (`server/src/modules/reviews/repository/pull.repo.ts:33`) nor the pulls repository (`server/src/modules/pulls/repository.ts:158`) has an `ORDER BY`. "Original/GitHub order" is the physical insertion order from `pulls/repository.ts:141-143` (delete + bulk insert), which matches today's behaviour but isn't guaranteed by Postgres. Within-group order on the server follows the same query. An `ORDER BY` would need an ordinal column (schema change), which is out of scope.
- **`latestPerAgent` with `agent_id = null`.** All agent-less reviews (e.g. `kind: 'summary'`, `server/src/modules/reviews/repository.ts:49`) collapse into one "agent". Not verified whether summary reviews ever carry findings or whether the intent classifier writes a `reviews` row. The plan treats `null` as one key on both sides.
- **Unverified anchors the implementer must confirm before editing:** whether `lineKey` is exported from `client/src/components/diff-viewer/comments.ts` (used at :66); the exact CSS variable names for the danger dot and role colours (pick existing tokens from `client/src/vendor/ui` / `diff-viewer/styles.ts`, don't invent new ones); the `Button` `kind` values available in `@devdigest/ui` for the toggle's selected state; that `FindingRecord` has `title`/`id` fields usable in tests (`FindingsPanel.tsx:63` uses `f.id`); that `repoFullName` is in scope in `page.tsx` where `DiffTab` renders (it's passed to `FindingsTab` at :158); that `SmartDiff` is exported as a value from the server's `@devdigest/shared` barrel for `SmartDiff.parse` in S4 (`server/src/vendor/shared/index.ts:6` lists it).
- **Copy placement.** Toggle/label/hint/counter copy goes in `prReview.json` `smartDiff` as requested. The two strings owned by the generic diff-viewer (dot label, "outside this diff" caption) go in `shell.json` `diffViewer`, the namespace diff-viewer already uses. Confirm this split.
- **No response schema** on the new route, matching `intent/routes.ts`. Shape conformance is proven by `SmartDiff.parse` in the S4 test, not at runtime.
- **The DiffTab toggle itself has no RTL test.** Covering it would mean mocking `lib/hooks/reviews` (pattern: `FindingsPanel.test.tsx:7`). The DiffViewer test covers grouped vs flat rendering, and the helper test covers the grouping. Add a DiffTab RTL test if the human wants the toggle covered directly.
- The existing hardcoded strings in `DiffTab.tsx` ("Hide comments"/"Show comments", "Files changed · N files", :55,60) predate this change and stay as they are. Moving them to messages is a separate cleanup.
