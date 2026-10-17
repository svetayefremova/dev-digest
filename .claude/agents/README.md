# Agents

Project subagents for DevDigest. Each `*.md` file here is the source of truth for its agent: the frontmatter configures the Claude Code subagent (tools, model, permissions, preloaded skills, hooks), and the body holds its procedure and output templates. This README is only a map — read the agent file for the actual rules.

## Flow

`researcher` (optional, any time; for a feature, a **context pack** for the planner) → `planner` → human sets the plan to `Status: approved` → `implementer <plan path>` → `test-writer` (optional, when tests are missing) → `plan-verifier <plan path>` + `architecture-reviewer` (+ security reviewer, planned, not in this folder yet) → `doc-writer` → `/pr-self-review` → PR.

Agent changes: request → `planner` → `docs/agent-specs/<name>.md` → human sets it to `Status: approved` → human writes `.claude/agents/<name>.md` (+ hook) → dry runs from the spec's Verification → `done`.

## Orchestration & token budget

Rules for whoever spawns these agents (the main session). They cut tokens without dropping a check: every agent keeps its preloaded skills and frontmatter model, the reviewers stay independent, and every plan item is still verified.

- **Explore once.** For a feature, either design in plan mode and hand the planner the approved design, or ask the `researcher` for a *context pack* (`researcher.md` → Context pack) and pass it to the `planner` verbatim. Never run broad exploration and then a planner that re-explores the same code: the planner trusts the pack's anchors and has an exploration budget (`planner.md` → Exploration budget).
- **Pass paths, not content.** Between agents pass only the plan path, the diff base and, for reviewers, the implementer's `Deviations` list. Never paste a diff or a full report into another agent's prompt; agents read the repo themselves.
- **Cheaper model only for mechanical one-off runs.** The `model` parameter of the Agent tool may be set to `haiku` for a context pack or a pure file search. Frontmatter models stay as they are; never downgrade the planner, architecture-reviewer or plan-verifier for real work.
- **Short command output.** Implementer and plan-verifier run every check themselves, with output trimmed to counts and failing test names (`2>&1 | tail -n 40`). Independence is kept; log volume is not.
- **Compact reports, summarised once.** The implementer report stays ≤ ~60 lines; the plan-verifier prints one line per `met` row and full detail only for gaps. The main session summarises a report and links its source; it does not re-render it.
- **Parallel where independent.** `plan-verifier` and `architecture-reviewer` run in parallel after the implementer; sequential steps (context pack → planner → implementer) are not split across extra agents.
- **Dev DB after a migration.** If the implementer report has a `Dev DB` line, apply that migration to the shared dev DB (the `server/INSIGHTS.md` procedure) before anyone opens the UI.

Plan lifecycle and naming: [`docs/plans/README.md`](../../docs/plans/README.md). Agent spec lifecycle and naming: [`docs/agent-specs/README.md`](../../docs/agent-specs/README.md). Feature docs written by `doc-writer`: [`docs/features/README.md`](../../docs/features/README.md).

## Catalog

| Agent | Responsibility | Model | Max turns |
|---|---|---|---|
| [planner](planner.md) | Turns a feature request into a self-contained Development Plan before any code is written, or an agent request into an agent specification. Never changes code or `.claude/**`. | opus | 40 |
| [implementer](implementer.md) | Executes an approved plan: edits code, adds tests, runs package checks, self-checks scope, reports with evidence. No architecture/security review. | sonnet | 80 |
| [researcher](researcher.md) | Read-only research in the repo and/or on the web; returns an evidence-backed report. | sonnet | default |
| [test-writer](test-writer.md) | Writes Vitest tests (client RTL, server `app.inject` / Testcontainers, reviewer-core) for already implemented code; never changes production code. | sonnet | 60 |
| [architecture-reviewer](architecture-reviewer.md) | Read-only review of a diff's architecture: layer boundaries (server onion layering, reviewer-core purity, client layering), module coupling (cycles, cross-module internals, cross-route imports) and abstraction leaks (framework/SDK/persistence types crossing a boundary, shared-contract duplication), against a named rule catalog. | opus | 40 |
| [plan-verifier](plan-verifier.md) | Read-only check of finished code against every item of a plan; returns a traceability matrix with evidence and orphan changes. | opus | 60 |
| [doc-writer](doc-writer.md) | Documents implemented features with Mermaid diagrams (`docs/features/<slug>.md` by default, module READMEs/docs when needed); every claim verified against code. | sonnet | 40 |

## Permissions

| Agent | Tools | Disallowed | `permissionMode` | Write scope and how it's enforced |
|---|---|---|---|---|
| planner | Read, Grep, Glob, Bash, Write | Edit, NotebookEdit, Agent, Skill, WebSearch, WebFetch | `default` | Only `docs/plans/<name>.md` and `docs/agent-specs/<name>.md` (not their `README.md`), overwrite only while `Status: draft`. **Hook-enforced** by [`planner-write-guard.sh`](../hooks/planner-write-guard.sh) (PreToolUse on Write, fails closed). Bash read-only by prompt. |
| implementer | Read, Edit, Write, Bash, Grep, Glob | Agent, Skill, WebSearch, WebFetch, NotebookEdit | `acceptEdits` | Only the plan's `Files` plus small listed deviations; no git state changes, no `db:migrate`, no installs. **Prompt-enforced** (no hook). |
| researcher | Read, Grep, Glob, Bash, WebSearch, WebFetch | Write, Edit, NotebookEdit, Skill, Agent | default | Writes nothing. Bash **hook-enforced** read-only by [`readonly-bash-guard.sh`](../hooks/readonly-bash-guard.sh) `--profile readonly` (PreToolUse on Bash, fails closed; allowlist of read-only git/fs commands). |
| test-writer | Read, Edit, Write, Bash, Grep, Glob | Agent, Skill, WebSearch, WebFetch, NotebookEdit | `acceptEdits` | Only test files and test helpers in `client/`, `server/`, `reviewer-core/`. **Hook-enforced** by [`test-writer-write-guard.sh`](../hooks/test-writer-write-guard.sh) (PreToolUse on Write\|Edit, fails closed). No production code, package.json or vitest config edits; Bash edits prompt-restricted only. |
| architecture-reviewer | Read, Grep, Glob, Bash | Write, Edit, NotebookEdit, Agent, Skill, WebSearch, WebFetch | `default` | Writes nothing. Bash **hook-enforced** read-only by [`readonly-bash-guard.sh`](../hooks/readonly-bash-guard.sh) `--profile readonly` (`git diff`/`log`/`show`/`grep`/`blame`/`merge-base`/`status`, `ls`, `wc`, `head`, `cat`, `rg`, `grep`, safe `find`). |
| plan-verifier | Read, Grep, Glob, Bash | Write, Edit, NotebookEdit, Agent, Skill, WebSearch, WebFetch | `default` | Writes nothing. Bash **hook-enforced** by [`readonly-bash-guard.sh`](../hooks/readonly-bash-guard.sh) `--profile verifier`: the readonly allowlist plus `npm test`, `npm run test`, `npm run typecheck`, `npm run build`, `npx vitest run`, `docker info` (no snapshot updates, no output files, no `db:*`). |
| doc-writer | Read, Edit, Write, Bash, Grep, Glob | NotebookEdit, Agent, Skill, WebSearch, WebFetch | `acceptEdits` | Only feature and module docs (`docs/features/*.md` except its README, root and module READMEs, `<module>/docs/*.md`, `server/src/modules/<name>/README.md`). **Hook-enforced** by [`doc-writer-write-guard.sh`](../hooks/doc-writer-write-guard.sh) (PreToolUse on Write\|Edit, fails closed). Bash edits prompt-restricted only. |

- No agent spawns subagents or invokes skills at runtime.
- `planner` and `implementer` preload the **same** 11 implementation skills via `skills:` (see below). `security` and `pr-self-review` are deliberately excluded — review belongs to separate agents.
- `test-writer` preloads 9 of them (no `react-best-practices` / `postgresql-table-design`: production-code design rules, not test rules).
- `architecture-reviewer` preloads engineering-insights, onion-architecture, frontend-architecture, next-best-practices, fastify-best-practices, typescript-expert.
- `doc-writer` preloads mermaid-diagram, engineering-insights, onion-architecture, frontend-architecture.
- `plan-verifier` has no preloaded skills on purpose: best-practice skills invite generic advice instead of criterion-by-criterion verification.
- `researcher` has no preloaded skills.
- Full agent → skills table: [`.claude/skills/README.md`](../skills/README.md#agent--preloaded-skills).

## Inputs and outputs

| Agent | Input | Output artifact | Status values |
|---|---|---|---|
| planner | Feature request with goal, scope and done criterion; or an agent request with responsibility, inputs/outputs and write scope. If any is missing → returns only "Clarifying questions", writes nothing. | `docs/plans/<verb-phrase>.md` or `docs/agent-specs/<agent-name>.md` (templates in `planner.md`) + short summary: path, steps/kind, modules or write scope, skills, open questions. | Plan / spec file: `draft` (set by planner) → `approved` / `done` (set by humans) |
| implementer | Path to a plan in `docs/plans/`. `draft` proceeds with a warning; `done` or missing → `BLOCKED`. | Code and test changes in the working tree (uncommitted), optional `<module>/INSIGHTS.md` entries, and an Implementation report: per-step status, command evidence, scope check, deviations, handoff to reviewers. | Report: `DONE` / `PARTIAL` / `BLOCKED` |
| researcher | A concrete question with scope. If vague → returns only "Clarifying questions". | Markdown report in the conversation (no files): TL;DR, findings with confidence, `path:line` or source evidence, explicit "Not found" list. | `Type: repo` / `external` / `mixed` |
| test-writer | Plan path and/or explicit target (files, routes, components, functions) that is already implemented. No target → returns only "Clarifying questions". | Test files in the working tree (uncommitted) and a Test report: tests added, command evidence, rubric check, not-tested list, suspected production defects, proposed INSIGHTS entries. | Report: `DONE` / `PARTIAL` / `BLOCKED` |
| architecture-reviewer | Diff base (default merge-base with `main`, plus working tree and untracked files) and optional plan path for intent. | Architecture review in the conversation (no files): rules checked, findings table (rule id, category `layer`/`coupling`/`leak`, severity, edge, quote), nits, handoff. | Report: `PASS` / `FINDINGS` / `NO_DIFF` / `BLOCKED`; finding severity `CRITICAL` / `WARNING` / `SUGGESTION` |
| plan-verifier | Path to a plan in `docs/plans/` plus optional extra requirements. Missing plan → `BLOCKED`. | Plan verification in the conversation (no files): traceability matrix, orphan changes, commands run, retractions, not-verifiable list. | Report: `VERIFIED` / `GAPS` / `BLOCKED`; row status `met` / `partial` / `not met` / `not verifiable` |
| doc-writer | Plan path or other materials plus a feature name; the feature must already be implemented. | Docs under the allowed paths (uncommitted) and a Docs report: docs written, claims evidence, plan-vs-code mismatches, proposed human edits (e.g. the `docs/features/README.md` index line), link check. | Report: `DONE` / `PARTIAL` / `BLOCKED` |

## Rule sources

Agents derive their rules from shared sources, so a plan, its implementation, tests, review and docs follow identical constraints.

| Source | What it governs | Used by |
|---|---|---|
| [`.claude/skills/README.md`](../skills/README.md) → *Routing* | Change zone → skills; the `[skills: …]` tag on every plan step | planner tags, implementer applies |
| Preloaded skills (`skills:` frontmatter): [engineering-insights](../skills/engineering-insights/SKILL.md), [typescript-expert](../skills/typescript-expert/SKILL.md), [zod](../skills/zod/SKILL.md), [next-best-practices](../skills/next-best-practices/SKILL.md), [react-best-practices](../skills/react-best-practices/SKILL.md), [frontend-architecture](../skills/frontend-architecture/SKILL.md), [react-testing-library](../skills/react-testing-library/SKILL.md), [fastify-best-practices](../skills/fastify-best-practices/SKILL.md), [onion-architecture](../skills/onion-architecture/SKILL.md), [drizzle-orm-patterns](../skills/drizzle-orm-patterns/SKILL.md), [postgresql-table-design](../skills/postgresql-table-design/SKILL.md) | Layer/folder placement, route/validation/query/schema shape, RSC boundaries, test style, typing | both |
| `<module>/CLAUDE.md` + `<module>/INSIGHTS.md` (via `engineering-insights`) | Module conventions and recorded gotchas / dead ends; read in full before planning or touching a module | both read; only implementer appends to `INSIGHTS.md` |
| [`server/INSIGHTS.md`](../../server/INSIGHTS.md) | Contracts are duplicated in `server/src/vendor/shared` and `client/src/vendor/shared` with no sync; never `db:migrate` against the shared dev Postgres | both |
| [`client/INSIGHTS.md`](../../client/INSIGHTS.md) | Client imports from `@devdigest/shared` with `import type` only | both |
| [`client/CLAUDE.md`](../../client/CLAUDE.md) | Styling via CSS variables + inline `style={{}}`, no Tailwind classes; UI copy in `client/messages/en/` | both |
| [`reviewer-core/CLAUDE.md`](../../reviewer-core/CLAUDE.md), root [`CLAUDE.md`](../../CLAUDE.md) | `reviewer-core` purity: only the injected `LLMProvider` as side effect | both |
| `onion-architecture` skill | Server layering routes → service → repository; adapters wired in `server/src/platform/container.ts` | both |
| [`TESTING.md`](../../TESTING.md) | Test strategy, `*.it.test.ts` with Testcontainers, outside world mocked via `server/src/adapters/mocks.ts`, per-package commands | both |
| [`docs/plans/README.md`](../../docs/plans/README.md) + plan template in `planner.md` | Plan format and lifecycle | planner writes, implementer reads |
| [`.claude/hooks/planner-write-guard.sh`](../hooks/planner-write-guard.sh) | Mechanical write restriction | planner |
| [`docs/agent-specs/README.md`](../../docs/agent-specs/README.md) + agent spec template in `planner.md` + this README | Agent spec format, lifecycle and naming; existing agents to avoid overlap with | planner writes, human implements |
| [`TESTING.md`](../../TESTING.md) + [`docs/skills/*`](../../docs/skills/) rubrics (over-mocking, edge cases, uncovered branches, flaky tests) | Test kind, scenario selection, quality bar | test-writer |
| `onion-architecture`, `frontend-architecture`, `next-best-practices` skills + severity convention in [`docs/agent-prompts/README.md`](../../docs/agent-prompts/README.md) | Rule catalog and `CRITICAL` / `WARNING` / `SUGGESTION` vocabulary | architecture-reviewer |
| The plan file itself (`docs/plans/<name>.md`) | The criteria that are enumerated and verified one by one | plan-verifier |
| `mermaid-diagram` skill + [`docs/features/README.md`](../../docs/features/README.md) | Diagram syntax; feature-doc section and index | doc-writer |
| [`.claude/hooks/test-writer-write-guard.sh`](../hooks/test-writer-write-guard.sh), [`.claude/hooks/doc-writer-write-guard.sh`](../hooks/doc-writer-write-guard.sh) | Mechanical write restriction | test-writer, doc-writer |
| [`.claude/hooks/readonly-bash-guard.sh`](../hooks/readonly-bash-guard.sh) | Mechanical Bash read-only restriction (profiles `readonly` / `verifier`) | researcher, architecture-reviewer, plan-verifier |

The researcher orients on the root and module `CLAUDE.md` / `INSIGHTS.md` for repo questions and prefers primary sources (official docs, repos, changelogs) for external ones.

## Maintenance

- **New implementation skill** → add it to the Routing table in `.claude/skills/README.md` **and** to `skills:` in both `planner.md` and `implementer.md` (the lists must stay identical).
- **Plan template change** → edit `planner.md`; the implementer relies on its section names (`Status`, `Files`, `Change`, `Acceptance`, `Tests`, `Depends on`, `Modules`), so update `implementer.md` too.
- **test-writer / doc-writer allowed paths change** → update the hook **and** the Permissions row here **and** the agent's Hard constraints.
- **New architecture rule** → add it to the rule catalog in `architecture-reviewer.md` with its category (`layer` / `coupling` / `leak`).
- **Agent spec template change** → edit `planner.md` (*Agent spec template*) and `docs/agent-specs/README.md` if lifecycle or naming changes.
- **Plan template change** → also update the ID families in `plan-verifier.md` Step 1.
- **Plan Verification command change** (planner template) → update the `verifier` profile in `readonly-bash-guard.sh`, or plan-verifier rows become `not verifiable`. Re-run the hook's piped-JSON checks (`docs/agent-specs/read-only-bash-guard.md` → Verification).
- **Read-only agent needs a new Bash command** → add it to the hook allowlist **and** the Permissions row here **and** the agent's Hard constraints.
- **New agent** → ask the `planner` for a spec in `docs/agent-specs/` first; create the agent file from the approved spec and add a row to the Catalog, Permissions and Inputs/outputs tables here.
- Don't copy agent procedures or templates into this README — link to the agent file instead.
