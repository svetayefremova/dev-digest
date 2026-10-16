# Plan: Add test-writer, architecture-reviewer, plan-verifier and doc-writer subagents

Status: draft · Date: 2026-10-15 · Modules: none of client/server/reviewer-core/e2e code — `.claude/` + `docs/` only

## Goal
Four new project subagents exist in `.claude/agents/`: `test-writer` (writes tests for already implemented code, hook-restricted to test files), `architecture-reviewer` (read-only, checks architecture boundaries of a diff), `plan-verifier` (read-only, verifies finished code against every item of a plan with evidence) and `doc-writer` (documents implemented features with Mermaid diagrams, hook-restricted to doc paths). The two writing agents have fail-closed PreToolUse write guards that pass the smoke tests, and the maps describing the agent set (`.claude/agents/README.md`, `.claude/skills/README.md` Routing, `docs/plans/README.md`) describe them consistently. A new `docs/features/` section with a human-maintained index exists.

## Non-goals
- No security reviewer agent (still planned separately; stays "planned" in the READMEs).
- No change to `planner.md`, `implementer.md`, `researcher.md`, `planner-write-guard.sh`, `pr-self-review-gate.sh` or `.claude/settings.json`.
- No product code, test code, package.json or vitest config changes in `client/`, `server/`, `reviewer-core/`, `e2e/`.
- No dependency-cruiser / ArchUnit config for the repo (architecture rules stay prompt-level fitness functions).
- No Bash-write guard hook for the read-only agents (prompt-enforced only; listed under Risks).
- No Mermaid CLI (`mmdc`) install; diagram validation is a prompt-level syntax self-check.
- The doc-writer does not write `docs/features/README.md`, `TESTING.md`, any `CLAUDE.md`/`INSIGHTS.md`.

## Context
- INSIGHTS applied:
  - server — contracts duplicated in `server/src/vendor/shared` and `client/src/vendor/shared` with no sync script (`server/INSIGHTS.md:18`) → becomes architecture-reviewer rule `shared/contract-duplicated` (CRITICAL).
  - client — value import from `@devdigest/shared` passes tsc/vitest but breaks the Next bundler at page load (`client/INSIGHTS.md:26-27`) → architecture-reviewer rule `client/shared-type-only` (CRITICAL); test-writer must not "fix" this by editing production code.
  - server — `new MockAuthProvider(undefined, workspace)` keeps non-uuid user `'u1'`, so a 422 assertion can pass for the wrong reason (`server/INSIGHTS.md:25`) → test-writer procedure: assert the setup response (e.g. the 201) before asserting the edge case; cite this entry in the agent body.
  - server — never `db:migrate` against the shared dev Postgres (`server/INSIGHTS.md:30-34`) → test-writer and plan-verifier hard constraint: no `db:migrate`/`db:generate`.
  - reviewer-core, e2e — INSIGHTS files have no entries → nothing applied.
- Constraints applied:
  - reviewer-core is pure (`reviewer-core/CLAUDE.md:28`) → architecture-reviewer rule `reviewer-core/purity` (CRITICAL); test-writer tests reviewer-core only with an injected fake `LLMProvider`.
  - Shared contracts duplicated (above) → reviewer rule + plan-verifier checks both copies when a plan's `Contracts & DB` names a contract.
  - Client `import type` only from `@devdigest/shared` → reviewer rule.
  - Client styling/i18n (`client/CLAUDE.md:30-32`) → test-writer reads copy from `client/messages/en/*.json` via `NextIntlClientProvider` (pattern: `client/src/app/agents/_components/AgentCard/AgentCard.test.tsx:3-6,30-32`); doc-writer never documents Tailwind usage. Not an architecture-reviewer rule (convention, not dependency direction).
  - Server layering routes → service → repository, adapters via container (onion-architecture skill §2-3) → architecture-reviewer rule catalog `server/*`.
  - DB changes via schema + `db:generate`, never `db:migrate` → none of the four agents runs either command.
  - Tests follow `TESTING.md` (typological, `*.it.test.ts`, mocks via `server/src/adapters/mocks.ts`) → test-writer procedure.
  - `server/package.json` is `skip-worktree` (`TESTING.md:83-86`) → test-writer never edits package.json; runs vitest via `npx vitest run …` as implementer does (`.claude/agents/implementer.md:72-77`).
  - Mechanical write restriction = frontmatter PreToolUse hook that fails closed, as `planner.md:22-27` + `.claude/hooks/planner-write-guard.sh` do → copied for test-writer and doc-writer.
- Reuse:
  - House style of agent files (frontmatter → `# Title` → intro → `## Hard constraints` → `## Step 0` gate → numbered steps → `## Report format (use exactly)` → `## Style rules`) — `.claude/agents/planner.md:1-57`, `.claude/agents/implementer.md:1-134`, `.claude/agents/researcher.md:1-130`
  - Clarifying-questions block format — `.claude/agents/planner.md:49-57`, `.claude/agents/researcher.md:27-35`
  - Hook skeleton (`deny()`, jq check, `tool_input.file_path`, `CLAUDE_PROJECT_DIR` fallback to `.cwd`, relative→absolute, `..` rejection, exit 2) — `.claude/hooks/planner-write-guard.sh:11-37`
  - Frontmatter hook wiring — `.claude/agents/planner.md:22-27`
  - Package check commands and "Docker only if `docker info` succeeds, else `skipped: <reason>`" — `.claude/agents/implementer.md:70-80`
  - Starting-state capture (`git status --short`, `git diff --name-only`) — `.claude/agents/implementer.md:53`
  - Test locations: client `src/**/*.test.{ts,tsx}` (`client/vitest.config.ts:18`), setup `client/src/test/setup.ts`; server `test/**/*.test.ts`, `src/**/*.test.ts` (`server/vitest.config.ts:14`), helpers `server/test/helpers/pg.ts`, `server/test/helpers/runs.ts`; reviewer-core `test/**/*.test.ts`, `src/**/*.test.ts` (`reviewer-core/vitest.config.ts:15`)
  - `dockerAvailable()` / `startPg()` — `server/test/helpers/pg.ts:23,35`; self-skip pattern `const d = hasDocker ? describe : describe.skip` — `server/test/skills.it.test.ts:12-13`
  - `MockLLMProvider`, `MockGitHubClient`, `MockGitClient`, `MockAuthProvider` — `server/src/adapters/mocks.ts:58,130,254,312`
  - `app.inject()` + `buildApp({ config, overrides })` — `server/test/routes-smoke.test.ts:1-30`; `ContainerOverrides` — `server/src/platform/container.ts:42`
  - Client mocking style: `vi.mock` of `src/lib/hooks/<domain>` + `vi.mock("next/navigation", …)` — `client/src/app/agents/_components/AgentsEmptyView/AgentsEmptyView.test.tsx:7-8`; MSW is not installed (`client/node_modules/msw` absent)
  - Test-quality rubrics to pre-satisfy — `docs/skills/over-mocking.md`, `docs/skills/edge-case-checklist.md`, `docs/skills/uncovered-branches.md`, `docs/skills/flaky-tests/SKILL.md`
  - Severity vocabulary `CRITICAL | WARNING | SUGGESTION` + anti-inflation rule — `docs/agent-prompts/README.md:76-78,89-92`
  - Onion rule catalog source — `.claude/skills/onion-architecture/SKILL.md` §2 "Dependency Rule, as concrete bans", §3, §5 "Anti-patterns"; sanctioned exceptions `server/src/modules/_shared/context.ts`, `server/src/platform/jobs.ts`
  - Frontend rule source — `.claude/skills/frontend-architecture/SKILL.md` §1, §4-6; `.claude/skills/next-best-practices/rsc-boundaries.md`, `directives.md`
  - Existing doc locations: root `README.md:25-27` (Architecture mermaid), `client/README.md:24`, `server/README.md:33,64`, `reviewer-core/README.md:16`, `server/src/modules/repo-intel/README.md:16` (mermaid blocks); `reviewer-core/docs/README.md`, `e2e/docs/README.md` ("one file per topic"); `reviewer-core/specs/README.md` (pre-implementation specs); Mermaid `^11.15.0` (`client/package.json:15`)
  - `mermaid-diagram` skill — `.claude/skills/mermaid-diagram/SKILL.md` (Decision Guide §23, Validation §274)
- Sources (research digest, fetched 2026-10-15):
  - Claude Code: code.claude.com/docs/en/sub-agents, /hooks, /permissions — read-only = tools allowlist without Write/Edit + `disallowedTools`; permission rules "aren't a security boundary" (Bash loophole); PreToolUse exit 2 denies before permission rules; subagents inherit parent acceptEdits/auto/bypass; `skills:` max 32; short descriptions, "use proactively", single responsibility.
  - Architecture: blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html; alistair.cockburn.us/hexagonal-architecture/; jeffreypalermo.com/2008/07/the-onion-architecture-part-1/; github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md; github.com/TNG/ArchUnit; Building Evolutionary Architectures 2nd ed. ch.2 (fitness functions).
  - Review practice: google.github.io/eng-practices/review/reviewer/looking-for.html, /comments.html.
  - Next.js: nextjs.org/docs/app/getting-started/server-and-client-components; nextjs.org/docs/app/guides/data-security; nextjs.org/docs/app/guides/testing/vitest.
  - Verification: swehb.nasa.gov/x/x4AIAw (bidirectional traceability); platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations; arxiv.org/abs/2508.12358.
  - Testing: testing-library.com/docs/guiding-principles; testing-library.com/docs/queries/about#priority; kentcdodds.com/blog/write-tests; fastify.dev/docs/latest/Guides/Testing; node.testcontainers.org/features/containers; vitest.dev/guide/mocking.
  - Docs: diataxis.fr; developers.google.com/style; writethedocs.org/guide/docs-as-code; c4model.com/abstractions; mermaid.js.org/intro/syntax-reference.html.
  - Repo: `TESTING.md`, `docs/agent-prompts/README.md`, `docs/skills/*`, `.claude/skills/README.md` (Routing), module `CLAUDE.md`/`INSIGHTS.md`, `.claude/hooks/planner-write-guard.sh`, existing agent files.

## Skills per module
| Module / zone | Skills (from routing table) |
|---|---|
| `.claude/hooks/*.sh` (bash) | none in routing table — follow `planner-write-guard.sh` pattern |
| `.claude/agents/*.md` (agent configs + prompts) | none in routing table for authoring; each agent's own `skills:` list is specified in its step |
| `docs/features/README.md`, READMEs | mermaid-diagram (only if a diagram is added — none planned) |
| Any (always) | engineering-insights (read half; no INSIGHTS entries expected — nothing module-specific is touched) |

## Steps

### S1 — test-writer write guard hook   [module: .claude] [skills: —]
- Files:
  - create `.claude/hooks/test-writer-write-guard.sh` (mode 755, like `planner-write-guard.sh`)
- Change: Copy the skeleton of `.claude/hooks/planner-write-guard.sh:11-37` (`set -uo pipefail`, `deny()` printing `test-writer-write-guard: <reason>` to stderr + `exit 2`, jq presence check, read stdin, `FILE_PATH` from `.tool_input.file_path`, `PROJECT_DIR` from `$CLAUDE_PROJECT_DIR` or `.cwd`, relative → absolute). Then, in order, fail closed:
  1. Deny any `..` segment (`*"/../"*|*"/.."`) and any `/./` segment or `//`.
  2. Deny if `ABS` is not under `"$PROJECT_DIR"/`; compute `REL="${ABS#"$PROJECT_DIR"/}"`.
  3. Deny if `REL` matches `(^|/)node_modules/` or `(^|/)vendor/` (vendored code is not tested in place) or ends in `.d.ts`.
  4. Allow (exit 0) only if `REL` matches one of these bash `[[ =~ ]]` regexes (each justified by the package's vitest `include`):
     - `^client/src/.+\.test\.tsx?$` — `client/vitest.config.ts:18`
     - `^client/src/test/.+\.tsx?$` — shared setup/helpers (`client/src/test/setup.ts`)
     - `^server/test/.+\.ts$` — `*.test.ts`, `*.it.test.ts`, `helpers/*.ts` (`server/vitest.config.ts:14`, `server/test/helpers/`)
     - `^server/src/.+\.test\.ts$` — `server/vitest.config.ts:14`
     - `^reviewer-core/test/.+\.ts$` — `reviewer-core/vitest.config.ts:15`
     - `^reviewer-core/src/.+\.test\.ts$` — `reviewer-core/vitest.config.ts:15`
  5. Anything else → `deny "test-writer may only write test files and test helpers (got: $FILE_PATH)"`.
  Header comment states the allowlist, that `e2e/` is excluded (flows are JSON fixtures, out of this agent's scope), and that it fails closed. `e2e/`, package.json, vitest configs, production `.ts/.tsx` are denied by omission.
- Acceptance: `bash -n` passes; smoke matrix in Verification (rows H1-*) gives the expected exit codes; denial reason is on stderr.
- Tests: hook smoke tests piping sample JSON (Verification table) · run: see Verification `H1`
- Depends on: —

### S2 — doc-writer write guard hook   [module: .claude] [skills: —]
- Files:
  - create `.claude/hooks/doc-writer-write-guard.sh` (mode 755)
- Change: Same skeleton and steps 1–2 as S1 (prefix `doc-writer-write-guard:`). Then:
  3. Deny `docs/features/README.md` explicitly with reason "docs/features/README.md is the human-maintained index".
  4. Allow only if `REL` matches:
     - `^docs/features/.+\.md$` — default home for feature docs (new section)
     - `^README\.md$` — root, only when architecture changes (prompt rule)
     - `^(client|server|reviewer-core|e2e)/README\.md$` — route/API/pipeline maps
     - `^(client|server|reviewer-core|e2e)/docs/.+\.md$` — module design notes, one file per topic (`reviewer-core/docs/README.md:3`, `e2e/docs/README.md:3-5`)
     - `^server/src/modules/[^/]+/README\.md$` — nested module READMEs (`server/src/modules/repo-intel/README.md`); `[^/]+` keeps it one level deep
  5. Anything else → deny with the allowlist in the reason.
  Header comment lists the deliberate exclusions and why: `docs/agent-prompts/` and `docs/skills/` (originals of reviewer prompts / review skills, product content), `docs/plans/` (planner-owned), `.claude/**` (agent/skill config), `reviewer-core/specs/` (pre-implementation specs, `reviewer-core/specs/README.md:3`), `TESTING.md`, every `CLAUDE.md` / `INSIGHTS.md` (human / engineering-insights owned), `client/src/vendor/ui/README.md` (vendored), `server/src/prompts/*.md` (LLM prompt templates = code), `e2e/specs/` (JSON flow fixtures), all non-`.md` files.
- Acceptance: `bash -n` passes; smoke matrix rows H2-* give expected exit codes.
- Tests: hook smoke tests (Verification `H2`) · run: see Verification
- Depends on: —

### S3 — test-writer agent   [module: .claude] [skills: —]
- Files:
  - create `.claude/agents/test-writer.md`
- Change: Frontmatter + body in the house style of `implementer.md`.
  - **Responsibility:** write UI tests (client/, Vitest + RTL, jsdom) and backend tests (server/: unit with `app.inject()`, integration `*.it.test.ts` with Testcontainers; reviewer-core unit) for code that is **already implemented**; run checks; report. Never changes production code.
  - **Frontmatter:**
    - `name: test-writer`
    - `description:` ≤3 sentences: "Writes Vitest tests for already implemented code in client/ (RTL + jsdom), server/ (app.inject, Testcontainers *.it.test.ts) and reviewer-core/. Writes only test files (hook-enforced), runs typecheck + unit tests, integration tests only when Docker is available. Use proactively after the `implementer` when a change lacks tests, passing the plan path or the files to cover."
    - `model: sonnet` — volume code generation following existing patterns, same tier as implementer; correctness is checked by actually running the tests.
    - `tools: Read, Edit, Write, Bash, Grep, Glob`
    - `disallowedTools: Agent, Skill, WebSearch, WebFetch, NotebookEdit`
    - `skills:` engineering-insights, typescript-expert, zod, react-testing-library, next-best-practices, frontend-architecture, fastify-best-practices, onion-architecture, drizzle-orm-patterns (excluded with reason in a YAML comment: react-best-practices / postgresql-table-design — production-code design rules, not test rules; security, pr-self-review — review-only)
    - `permissionMode: acceptEdits` — writes many files; the hook is the real guard (subagent may inherit an even looser parent mode anyway).
    - `maxTurns: 60`
    - `hooks: PreToolUse: - matcher: "Write|Edit"` → `command: "$CLAUDE_PROJECT_DIR/.claude/hooks/test-writer-write-guard.sh"`
  - **Body sections:**
    - Hard constraints: only test files/helpers (hook-enforced, list the allowlist); never modify production code to make a test pass — report suspected defects instead; no git state changes; no installs (MSW is not installed — no MSW without a plan step); no `db:migrate`/`db:generate`; no edits to package.json/vitest configs (`TESTING.md:83-86`); never `.only`/`.skip`/`it.todo` left in the tree except the existing `dockerAvailable()` self-skip pattern; never spawn subagents or web search; don't fake success; `engineering-insights` read half only (hook blocks INSIGHTS writes → propose entries in the report).
    - Step 0 — Input gate: input = plan path and/or explicit target (files, routes, components, functions). No target → clarifying-questions block (format of `planner.md:49-57`). Target code missing → `BLOCKED`. Plan `draft` → proceed with a note.
    - Step 1 — Load context: read touched modules' `CLAUDE.md` + `INSIGHTS.md` in full, `TESTING.md`, the target code, and the 1–2 nearest existing tests (neighbouring `*.test.tsx`, `server/test/*`, `reviewer-core/test/*`) to copy their setup; record starting `git status --short`.
    - Step 2 — Choose test kind (decision table): client component → colocated `Component.test.tsx` next to the component, jsdom, `NextIntlClientProvider` with `client/messages/en/<ns>.json`, `vi.mock` of `src/lib/hooks/<domain>` / `next/navigation` as neighbours do; async Server Component → do not unit-test, recommend an e2e flow; server route without DB → `server/test/<name>.test.ts` via `buildApp({ config, overrides })` + `app.inject()` with mocks from `server/src/adapters/mocks.ts`; DB-backed route/repository → `server/test/<name>.it.test.ts` with `dockerAvailable()`/`startPg()` and `hasDocker ? describe : describe.skip`; reviewer-core → `reviewer-core/test/<name>.test.ts` with a fake `LLMProvider`; e2e → never write, recommend.
    - Step 3 — Scenario selection (TESTING.md "typological, not exhaustive"): one happy path + the edge case that matters per behaviour; RTL query priority (`getByRole` first, `getByTestId` last); `userEvent.setup()`; Vitest `vi.useFakeTimers`/`vi.setSystemTime`/`vi.stubGlobal` with restore in `afterEach`; assert setup responses before edge assertions (`server/INSIGHTS.md:25`).
    - Step 4 — Rubric pre-check against `docs/skills/over-mocking.md`, `edge-case-checklist.md`, `uncovered-branches.md`, `flaky-tests/SKILL.md` (mock only the outside world; no time/random/order dependence; each new branch in the target exercised or listed as uncovered).
    - Step 5 — Run checks per touched package (same table as `implementer.md:72-77`): client `npm run typecheck && npm test`; server `npm run typecheck && npx vitest run --exclude '**/*.it.test.ts'`; server integration `npx vitest run .it.test` **only if** `docker info` succeeds, else record `skipped: docker info failed (<first line of error>)`; reviewer-core `npm run typecheck && npm test`. Max 2 fix attempts per failure. A failing test whose cause is in production code → remove it from the tree, keep the repro in the report, status `PARTIAL`.
    - Step 6 — Self-check: changed files ⊆ allowlist; no `.only`/`console.log`; every test name describes user-visible behaviour.
    - Report format (use exactly) outline: `# Test report: <target>` · `Status: DONE | PARTIAL | BLOCKED` · `## Tests added` table (File | Kind unit/it/component | Behaviour | Scenario happy/edge) · `## Verification (evidence)` table (Package | Command | Result with counts) + `- Skipped: <command — reason>` · `## Rubric check` (over-mocking / edge-case / uncovered-branches / flaky: pass or note) · `## Not tested (and why)` (incl. async RSC → e2e) · `## Suspected production defects` (test, failure output trimmed, `path:line`) · `## Proposed INSIGHTS entries` · `## Scope check`.
    - Style rules: lead with status; real counts only; no diffs pasted.
- Acceptance: file starts with `---` frontmatter containing every listed key; body has all listed sections in order; `hooks` points to the S1 script; `skills:` list exactly as above.
- Tests: frontmatter sanity (Verification `F1`) · run: `head -30 .claude/agents/test-writer.md`
- Depends on: S1

### S4 — architecture-reviewer agent   [module: .claude] [skills: —]
- Files:
  - create `.claude/agents/architecture-reviewer.md`
- Change:
  - **Responsibility:** check architecture boundaries of a diff (onion layering in server/, reviewer-core purity, frontend layering + RSC/client boundaries in client/, shared-contract duplication) and return findings with evidence. No code style, security, tests or performance review.
  - **Frontmatter:** `name: architecture-reviewer`; `description:` "Read-only review of a diff's architecture boundaries: server onion layering, reviewer-core purity, client layering and RSC/client boundaries, shared-contract duplication. Returns rule-based findings with file:line evidence. Use proactively after the `implementer` and before `/pr-self-review`."; `model: opus` — judgment over import graphs where false positives are costly and the rule catalog must be applied precisely; `tools: Read, Grep, Glob, Bash`; `disallowedTools: Write, Edit, NotebookEdit, Agent, Skill, WebSearch, WebFetch`; `skills:` engineering-insights, onion-architecture, frontend-architecture, next-best-practices, fastify-best-practices, typescript-expert; `permissionMode: default`; `maxTurns: 40`; no hooks.
  - **Hard constraints:** writes nothing (no Write/Edit; Bash read-only by prompt: `git diff`, `git log`, `git show`, `git grep`, `git merge-base`, `git status`, `ls`, `wc`; no `>`/`tee`/`sed -i`/`mv`/`rm`, no builds/tests/installs, no git state changes); only report violations **introduced or touched by the diff**; no speculative-generality advice; no security/style findings (hand off); every finding has evidence.
  - **Step 0 — input gate:** input = diff base (default `git merge-base main HEAD`, plus uncommitted working tree and untracked files from `git status --short`) and optional plan path for intent. Empty diff → `Status: NO_DIFF`. Unresolvable base → clarifying questions.
  - **Step 1:** list changed files; read `CLAUDE.md` + `INSIGHTS.md` of touched modules; classify each file into a ring/layer (server: routes/service/repository/adapters/container/vendor; client: `app/**/_components`, `components/`, `lib/`, `lib/hooks/`, `vendor/`).
  - **Step 2 — Rule catalog (named binary fitness functions; severity inherited from the rule):**
    - `server/service-no-fastify` — service/repository/types import `fastify` (exception `modules/_shared/context.ts`) — CRITICAL
    - `server/service-no-concrete-adapter` — service imports `adapters/*` or `new`s a concrete adapter — CRITICAL
    - `server/adapter-via-container` — concrete adapter constructed outside `platform/container.ts` — CRITICAL
    - `server/route-thin` — `routes.ts` imports `drizzle-orm`/`db/`/concrete adapters or holds business rules — WARNING
    - `server/drizzle-only-in-repository` — `drizzle-orm` import outside `repository.ts` (exceptions: `typeof t.x.$inferSelect` type extraction, `db/*`, `platform/jobs.ts`) — WARNING
    - `server/no-cross-module-repo` — module imports another module's `repository.ts` instead of the container getter — WARNING
    - `server/no-di-framework` — adds awilix/tsyringe/inversify — WARNING
    - `server/fat-route-growth` — diff grows a known fat route (`modules/polling`, `pulls`, `workspace` routes per onion §5) — SUGGESTION
    - `reviewer-core/purity` — import of `fs`/`node:fs`, `child_process`, DB, octokit, simple-git, or `server/` code — CRITICAL
    - `reviewer-core/called-from-service` — `reviewPullRequest` used outside the service layer — WARNING
    - `shared/contract-duplicated` — contract change in one `vendor/shared` copy but not the other — CRITICAL
    - `client/shared-type-only` — value import from `@devdigest/shared` — CRITICAL
    - `client/no-server-in-client-graph` — a `"use client"` module (transitively, within the diff) imports `server-only`, DB, `node:*` or server code — CRITICAL
    - `client/no-async-client-component` — async component in a `"use client"` file — CRITICAL
    - `client/env-in-data-layer` — `process.env` outside `src/lib/` or server-only modules (except `NEXT_PUBLIC_*`) — WARNING
    - `client/serializable-props` — non-serializable props passed Server → Client Component — WARNING
    - `client/data-hooks-in-lib` — data fetching inline in a component instead of `src/lib/hooks/<domain>.ts` — WARNING
    - `client/no-domain-rules` — domain validation/workflow rules re-derived client-side — WARNING
    - `client/colocation` — premature promotion to `components/`/`lib/` with a single consumer — SUGGESTION
    Each rule cites its source (onion-architecture / frontend-architecture / next-best-practices section, module INSIGHTS line). The body states there is no depcruise config for this repo (dependency-cruiser in `server/` is a product feature for repo-intel), so these rules are the catalog.
  - **Severity discipline** (`docs/agent-prompts/README.md:76-92`): exactly `CRITICAL | WARNING | SUGGESTION`; anti-inflation — speculative issues at most WARNING; no quota; empty list is a valid result; nits/FYI in a separate bucket capped at 5.
  - **Report format (use exactly) outline:** `# Architecture review: <base>..<head|working tree>` · `Status: PASS | FINDINGS | NO_DIFF | BLOCKED` (PASS iff zero CRITICAL and zero WARNING) · `## Scope` (files reviewed, layer per file) · `## Rules checked` (every rule id + `pass | violated | n/a`) · `## Findings` table: Rule id | Severity | Edge `from:line → to` | Verbatim quote | Why | Fix direction (one line) · `## Nits / FYI (max 5)` · `## Could not verify` · `## Handoff` (security / test / style observations, one line each).
  - **Style rules:** one finding per offending edge; quote verbatim; no fix code.
- Acceptance: frontmatter has no Write/Edit in `tools`, both in `disallowedTools`; rule catalog lists all rules above with ids and severities; report template matches the outline.
- Tests: frontmatter sanity (Verification `F2`) · run: `head -20 .claude/agents/architecture-reviewer.md`
- Depends on: —

### S5 — plan-verifier agent   [module: .claude] [skills: —]
- Files:
  - create `.claude/agents/plan-verifier.md`
- Change:
  - **Responsibility:** given a plan path (+ optional extra requirements), verify the finished code against **every** plan item and requirement, one by one, with evidence. Produces a traceability matrix. Gives no generic advice and proposes no fixes.
  - **Frontmatter:** `name: plan-verifier`; `description:` "Read-only verification of finished code against a Development Plan (docs/plans/*.md) and optional extra requirements: enumerates every plan item, checks each with file:line or command evidence, and returns a traceability matrix plus orphan changes. Use proactively after the `implementer` finishes, passing the plan path."; `model: opus` — long cross-referencing between plan and diff where a misjudged "met" is the expensive error; `tools: Read, Grep, Glob, Bash`; `disallowedTools: Write, Edit, NotebookEdit, Agent, Skill, WebSearch, WebFetch`; no `skills:` (deliberate: preloaded best-practice skills invite generic advice instead of criterion-by-criterion verification — arXiv 2508.12358); `permissionMode: default`; `maxTurns: 60`; no hooks.
  - **Hard constraints:** writes nothing; Bash read-only **plus** exactly the commands in the plan's `Verification` table and per-step `Tests … run:` commands (decision: running them is the only way to produce evidence for Verification/Tests items; they only write build/test caches). Never: installs, `db:migrate`, `db:generate`, git state changes, `npx vitest run .it.test` unless `docker info` succeeds (else `not verifiable: docker unavailable`). No fix proposals, no advice beyond the gap note of a row.
  - **Step 0 — input gate:** plan path must exist in `docs/plans/`; else `BLOCKED`. Plan `draft` → proceed with a note. Extra requirements, if given, become `R1..Rn`.
  - **Step 1 — Enumerate before reading code:** build the item list with IDs, none merged or skipped: `G1..` (each Goal sentence), `NG1..` (Non-goals — verified as "not done"), per step `S<n>.F<k>` (each Files line), `S<n>.C`, `S<n>.A`, `S<n>.T`, `CA1..` (Constraints applied lines), `CT1..`/`DB1..` (Contracts & DB lines), `V1..` (Verification rows), `R1..`.
  - **Step 2 — Verify each row:** status `met | partial | not met | not verifiable`; evidence = `path:line` + verbatim quote, or test name + command + result counts. Coverage ≠ verification: a file that mentions the topic is not "met". No evidence ⇒ `not met` or `not verifiable` (with why). Gap note is tied only to that criterion.
  - **Step 3 — Reverse pass:** diff vs base (default `git merge-base main HEAD` + working tree + untracked) → every changed file/hunk maps to at least one item ID; unmapped → `Orphans / scope creep`.
  - **Step 4 — Self-check:** re-open each `met` row's quoted line; retract (downgrade) any row whose quote isn't present verbatim; list retractions.
  - **Report format (use exactly) outline:** `# Plan verification: <plan path>` · `Status: VERIFIED | GAPS | BLOCKED` (VERIFIED iff every row is `met`; `not verifiable` rows are flagged, not blocking — see Risks) · `## Summary` (counts per status) · `## Traceability matrix` table: ID | Criterion (quoted) | Status | Evidence | Gap note · `## Orphans / scope creep` · `## Commands run` (command → result) · `## Retractions (self-check)` · `## Not verifiable` (why, what would verify it).
  - **Style rules:** quote the plan criterion verbatim; one row per ID; no recommendations section.
- Acceptance: Step 1 enumerates all ID families above; statuses exactly the four values; no `skills:` key; template matches outline.
- Tests: frontmatter sanity (Verification `F3`) · run: `head -15 .claude/agents/plan-verifier.md`
- Depends on: —

### S6 — doc-writer agent   [module: .claude] [skills: —]
- Files:
  - create `.claude/agents/doc-writer.md`
- Change:
  - **Responsibility:** document implemented features: turn a plan or other materials into docs with Mermaid diagrams, placed in the right section.
  - **Frontmatter:** `name: doc-writer`; `description:` "Documents implemented DevDigest features from a plan or other materials: writes docs/features/<slug>.md (default) and updates module READMEs/docs or the root README when architecture changes, with Mermaid diagrams. Every claim is verified against code. Use after a feature is implemented and verified."; `model: sonnet` — prose generation from verified sources, claims are checked against code by procedure; `tools: Read, Edit, Write, Bash, Grep, Glob`; `disallowedTools: NotebookEdit, Agent, Skill, WebSearch, WebFetch`; `skills:` mermaid-diagram, engineering-insights, onion-architecture, frontend-architecture (the last two so layer names in diagrams match the repo's vocabulary); `permissionMode: acceptEdits`; `maxTurns: 40`; `hooks: PreToolUse matcher "Write|Edit"` → `$CLAUDE_PROJECT_DIR/.claude/hooks/doc-writer-write-guard.sh`.
  - **Hard constraints:** write only the S2 allowlist (hook-enforced; list it and the exclusions); document implemented behaviour only — every claim backed by code or plan read in this session (`path:line` in the report), code wins over plan when they disagree (report the mismatch); Bash read-only; no git state changes; no installs (no `mmdc`); `docs/features/README.md`, `CLAUDE.md`, `INSIGHTS.md` changes are proposed in the report, not written.
  - **Step 0 — input gate:** plan path or materials + feature name. Feature not implemented (key symbols from the plan not found) → `BLOCKED`. Unclear audience/scope → clarifying questions.
  - **Step 1:** read inputs, touched modules' `CLAUDE.md`/`INSIGHTS.md`/`README.md`, and the code the doc will describe.
  - **Step 2 — Placement table:** feature behaviour / how-to / explanation → `docs/features/<slug>.md` (default); module route/API/pipeline map changed → `<module>/README.md`; module-internal design decision → `<module>/docs/<topic>.md` (one file per topic); repo-intel internals → `server/src/modules/repo-intel/README.md`; new package/container/external system → root `README.md` Architecture diagram (`README.md:25-27`). Pre-implementation specs (`reviewer-core/specs/`) are not this agent's job.
  - **Step 3 — Write:** Diátaxis, one type per page (tutorial / how-to / reference / explanation; state the type in the report); Google developer style (second person, active voice, present tense; project conventions win); docs-as-code (same change set). Feature doc outline: title, one-paragraph summary, how it works, diagram(s), key files (`path` links), limitations, related docs.
  - **Step 4 — Diagrams:** C4 level → Mermaid type: context/containers and module components → `flowchart`, runtime interaction → `sequenceDiagram`, DB → `erDiagram`; stay within Mermaid ^11.15 (`client/package.json:15`); syntax self-check per `mermaid-diagram` Validation (quote labels with special characters, never use bare `end` as a node id, one diagram ≤ ~15 nodes); every node maps to a real file/symbol.
  - **Step 5 — Self-check:** relative links resolve (`ls` each target); changed files ⊆ allowlist.
  - **Report format (use exactly) outline:** `# Docs report: <feature>` · `Status: DONE | PARTIAL | BLOCKED` · `## Docs written` table: Path | Diátaxis type | Diagrams (type) | New/updated · `## Claims evidence` (claim → `path:line`) · `## Plan vs code mismatches` · `## Proposed human edits` (index line for `docs/features/README.md`, "Read when" lines for `<module>/CLAUDE.md`) · `## Link check` · `## Could not verify`.
  - **Style rules:** no claim without evidence; no marketing language; link instead of copying content that lives elsewhere.
- Acceptance: frontmatter keys present; `hooks` points to S2 script; placement table and off-limits list match S2's allowlist exactly.
- Tests: frontmatter sanity (Verification `F4`) · run: `head -25 .claude/agents/doc-writer.md`
- Depends on: S2

### S7 — docs/features index   [module: docs] [skills: —]
- Files:
  - create `docs/features/README.md`
- Change: Short human-maintained index: purpose (one page per implemented feature, written by `doc-writer` from `.claude/agents/doc-writer.md`), naming `<slug>.md` (slug matches the plan slug when there is one), one Diátaxis type per page, and an index table `| Feature | Doc | Plan | Modules |` with a "No features documented yet." row. States that `doc-writer` cannot edit this README (`.claude/hooks/doc-writer-write-guard.sh`) and proposes index lines in its report. Mirror the tone of `docs/plans/README.md:1-10`.
- Acceptance: file exists; links to `../../.claude/agents/doc-writer.md` and `../../.claude/hooks/doc-writer-write-guard.sh` resolve.
- Tests: link check (Verification `L1`)
- Depends on: S6

### S8 — agents README   [module: .claude] [skills: —]
- Files:
  - modify `.claude/agents/README.md` — Flow, Catalog, Permissions, Inputs and outputs, Rule sources, Maintenance
- Change (edit in place, keep existing rows):
  - Flow (line 7): `researcher` (optional) → `planner` → human approves → `implementer <plan path>` → `test-writer` (optional, when tests are missing) → `plan-verifier <plan path>` + `architecture-reviewer` (+ security reviewer, planned) → `doc-writer` → `/pr-self-review` → PR. Add a link to `docs/features/README.md`.
  - Catalog: 4 rows (responsibility, model, max turns: test-writer sonnet 60, architecture-reviewer opus 40, plan-verifier opus 60, doc-writer sonnet 40).
  - Permissions: 4 rows with tools / disallowed / permissionMode / write scope + enforcement (test-writer, doc-writer: **hook-enforced** with link to the hook; architecture-reviewer, plan-verifier: writes nothing, Bash read-only by prompt; plan-verifier may run the plan's Verification commands). Update the bullets under the table: "No agent spawns subagents…" stays; replace the "planner and implementer preload the same 11 skills" bullet's neighbours with one bullet per new agent's skills (or "none" for plan-verifier, with the reason).
  - Inputs and outputs: 4 rows (input, output artifact, status values: test-writer `DONE/PARTIAL/BLOCKED`; architecture-reviewer `PASS/FINDINGS/NO_DIFF/BLOCKED`; plan-verifier `VERIFIED/GAPS/BLOCKED` with row statuses `met/partial/not met/not verifiable`; doc-writer `DONE/PARTIAL/BLOCKED`).
  - Rule sources: rename heading to "Rule sources" (drop "— planner and implementer"); keep the existing table; add rows: `TESTING.md` + `docs/skills/*` rubrics → test-writer; onion-architecture / frontend-architecture / next-best-practices + `docs/agent-prompts/README.md` severity convention → architecture-reviewer; the plan file itself → plan-verifier; `mermaid-diagram` + `docs/features/README.md` → doc-writer; the two new hooks → their agents.
  - Maintenance: add — "test-writer / doc-writer allowed paths change → update the hook **and** the Permissions row and the agent's Hard constraints"; "new architecture rule → add to the rule catalog in `architecture-reviewer.md`"; "plan template change → also update the ID families in `plan-verifier.md` Step 1".
- Acceptance: each of the 4 agents appears in Catalog, Permissions, Inputs/outputs; all new relative links resolve.
- Tests: link check (Verification `L2`)
- Depends on: S1–S7

### S9 — skills Routing table   [module: .claude] [skills: —]
- Files:
  - modify `.claude/skills/README.md` — Routing section (currently uncommitted in the working tree; edit in place with targeted edits, do not overwrite the file)
- Change: Keep the change-zone table. Replace the row `| Review only (not used by implementer) | security, pr-self-review |` with `| Review only (not preloaded by any agent) | security, pr-self-review |` and the row `| Docs/plans only | mermaid-diagram |` with `| Docs (doc-writer) | mermaid-diagram |`. Add a second small table "Agent → preloaded skills" after it: planner/implementer — the 11 implementation skills; test-writer — the S3 list; architecture-reviewer — the S4 list; plan-verifier — none (with reason); doc-writer — the S6 list; researcher — none. Update the intro sentence so it no longer says only planner/implementer use the table.
- Acceptance: lists in the README equal the `skills:` frontmatter of each agent file.
- Tests: `grep -A12 '^skills:' .claude/agents/*.md` compared by eye with the table (Verification `F5`)
- Depends on: S3–S6

### S10 — plans README flow line   [module: docs] [skills: —]
- Files:
  - modify `docs/plans/README.md` — line 10
- Change: Flow: `planner` → human approves the plan → `implementer <plan path>` → `test-writer` (optional) → `plan-verifier <plan path>` + `architecture-reviewer` (+ security reviewer, planned) → `doc-writer` → `/pr-self-review` → PR. Add one bullet: "`plan-verifier` reads the plan and checks every item; keep criteria checkable."
- Acceptance: flow line matches `.claude/agents/README.md` Flow.
- Tests: visual diff `git diff docs/plans/README.md`
- Depends on: S8

## Contracts & DB
- Contracts: none
- DB: none

## Verification
| Package | Command |
|---|---|
| hooks syntax | `bash -n .claude/hooks/test-writer-write-guard.sh && bash -n .claude/hooks/doc-writer-write-guard.sh && ls -l .claude/hooks/` (both new hooks `-rwxr-xr-x`) |
| H1 smoke (test-writer) | `t(){ printf '{"tool_input":{"file_path":"%s"},"cwd":"%s"}' "$1" "$PWD" \| CLAUDE_PROJECT_DIR="$PWD" .claude/hooks/test-writer-write-guard.sh; echo "$1 -> $?"; }` then: exit 0 for `server/test/foo.test.ts`, `server/test/foo.it.test.ts`, `server/test/helpers/x.ts`, `client/src/app/x/_components/A/A.test.tsx`, `client/src/test/setup.ts`, `reviewer-core/test/x.test.ts`, `$PWD/server/src/x.test.ts`; exit 2 for `server/src/app.ts`, `client/src/app/page.tsx`, `server/package.json`, `server/vitest.config.ts`, `server/test/../src/app.ts`, `client/node_modules/x/a.test.ts`, `e2e/specs/01.flow.json`, `/etc/passwd`, `server/test/foo.test.js`, and empty input `echo '{}'` |
| H2 smoke (doc-writer) | same helper with `doc-writer-write-guard.sh`: exit 0 for `docs/features/review-runs.md`, `README.md`, `server/README.md`, `reviewer-core/docs/grounding.md`, `server/src/modules/repo-intel/README.md`; exit 2 for `docs/features/README.md`, `docs/plans/x.md`, `docs/skills/x.md`, `docs/agent-prompts/x.md`, `.claude/agents/x.md`, `server/CLAUDE.md`, `client/INSIGHTS.md`, `TESTING.md`, `reviewer-core/specs/x.md`, `server/src/prompts/x.md`, `server/src/modules/a/b/README.md`, `docs/features/../plans/x.md`, `docs/features/x.txt`, `server/src/app.ts` |
| F1–F4 frontmatter | `for f in test-writer architecture-reviewer plan-verifier doc-writer; do head -30 .claude/agents/$f.md; done` — each starts with `---`, has name/description/model/tools/disallowedTools/permissionMode/maxTurns (+ skills/hooks per step), closes with `---` |
| F5 skills parity | `grep -n -A12 '^skills:' .claude/agents/*.md` vs `.claude/skills/README.md` agent table |
| L1/L2 links | for each `](…)` relative link in `.claude/agents/README.md`, `docs/features/README.md`, `docs/plans/README.md`, `.claude/skills/README.md`: `ls <resolved path>` succeeds |
| scope | `git status --short` — only the 8 created/modified paths of S1–S10 appear (plus the pre-existing `M .claude/skills/README.md`, `?? .claude/agents/`, `?? .claude/hooks/planner-write-guard.sh`, `?? docs/plans/`) |

## Out of scope / handed off
- Architecture review → architecture reviewer agent: not applicable to product code; a human should sanity-check the rule catalog in `architecture-reviewer.md` against `onion-architecture`/`frontend-architecture` once.
- Security review → security reviewer agent (planned): the two write-guard hooks (path normalisation, `..`/`//`/`/./` rejection, fail-closed on missing jq/input, absolute paths outside the project, symlinks); Bash as a write loophole for the read-only agents.
- e2e: none. After merge, a manual dry run of each agent on a small finished plan is recommended (e.g. run `plan-verifier` on this plan once implemented).

## Risks & open questions
- **Unverified sources:** IEEE 1012 / ISO 29148 text (paywalled) — traceability design rests on NASA SWE handbook instead; no quantitative source on LLM severity inflation (anti-inflation rule is the repo convention `docs/agent-prompts/README.md:89-92`, not measured); Vitest docs were fetched for latest while the repo is on Vitest 2 (`client/CLAUDE.md:7`, `server/CLAUDE.md:7`) — `vi.setSystemTime`/`stubGlobal`/`unstubAllGlobals` exist in 2.x but test-writer should follow neighbouring tests if an API differs.
- **Global Bash hook inside subagents:** whether `.claude/settings.json` → `pr-self-review-gate.sh` (PreToolUse Bash) fires for subagent Bash calls is unverified. It only gates `gh pr create`/merge/push, which none of the new agents may run, so impact is low.
- **Bash write loophole:** architecture-reviewer and plan-verifier have no Write/Edit but can still write via Bash; restriction is prompt-only (permission rules "aren't a security boundary"). An optional read-only Bash guard hook is a follow-up decision.
- **Permission-mode inheritance:** subagents inherit a parent's acceptEdits/auto/bypassPermissions; for test-writer and doc-writer the PreToolUse hooks (exit 2 denies before permission rules) are the real guard. Edits via Bash (`sed -i`, heredoc) in those two agents are prompt-restricted only.
- **Hooks don't resolve symlinks** (same as `planner-write-guard.sh`); a symlink inside an allowed folder could point elsewhere. None exist today; accepted risk, listed for the security reviewer.
- **`not verifiable` rows:** default is flagged but not blocking (`VERIFIED` requires all `met`, so a `not verifiable` row yields `GAPS`). Confirm whether `not verifiable` should instead be neutral.
- **plan-verifier runs commands:** decision taken to let it run the plan's Verification/Tests commands verbatim (read-only in effect; writes only caches). Confirm, or restrict it to reading the implementer's report.
- **test-writer on real defects:** decision taken to remove a test that fails because of production code and report a repro (repo forbids leftover skipped tests, `implementer.md:86`). Alternative: keep it as `it.fails(...)` with a link to the report — human decision.
- **Skill deviation:** `react-testing-library` prefers MSW and says not to mock fetch/hooks directly; the repo has no MSW and its client tests `vi.mock` `src/lib/hooks/<domain>` (`client/src/app/agents/_components/AgentsEmptyView/AgentsEmptyView.test.tsx:7-8`). test-writer follows the repo pattern; adding MSW needs its own plan.
- **`TESTING.md` excluded from doc-writer:** treated as human-owned cross-package policy. Confirm, or add `^TESTING\.md$` to the doc-writer allowlist.
- **`<module>/docs/` for client and server don't exist yet**; the allowlist permits creating them. Confirm, or restrict to `reviewer-core/docs` and `e2e/docs`.
- **`.claude/skills/README.md` has uncommitted changes** (the Routing section itself is new in the working tree); S9 must use targeted edits so those changes are preserved.
- Security reviewer agent is still not part of this set; Flow lines keep it marked "planned".

## Post-plan notes
- 2026-10-15 — NG2 exception: `.claude/agents/planner.md` (lines 3, 36) was edited deliberately, at the user's request, to adopt the dateless `<verb-phrase>.md` naming rule from `docs/plans/README.md` → Naming. That edit is outside this plan's steps and is not a deviation by the implementer.
- 2026-10-15 — V7 scope count: S1–S10 create/modify **10** paths (7 created + 3 modified), not 8.
- 2026-10-15 — S4/S5/S6 `description:` values are double-quoted in YAML: the plan's wording contains `: `, which is invalid in a plain YAML scalar.
- 2026-10-15 — S10 flow line was aligned word-for-word with `.claude/agents/README.md` Flow (S10.A).
