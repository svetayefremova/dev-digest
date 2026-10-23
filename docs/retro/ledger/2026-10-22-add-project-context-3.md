# Workflow retro — docs/plans/add-project-context.md (run 3: tests + re-verify + UI fixes)

Date: 2026-10-22 · Session: 5869c56b · Mode: base
Commit: 2b2c23f
Wall clock: — (no timestamps in context) · Dispatches: 9 (test-writer×5, SendMessage→test-writer×1, spec-creator×1, plan-verifier×1) · Fix rounds: — (no /run-plan loop; tests written outside /run-plan)

Scope: from the first test-writer dispatch for SPEC-01 through the plan-verifier re-run and the two small UI fixes with tests. The earlier agent-definition review in this session used no subagents and is excluded.

## Timeline
| # | Phase | Agent (type — description) | Parallel with | Outcome | Tokens | Tool uses | Duration |
|---|---|---|---|---|---|---|---|
| 1 | tests | test-writer — TW-server (bg) | 2 | PARTIAL (1 kept failing test: AC-37 8,010 > 8,000) | 172,588 | 37 | 328.7 s |
| 2 | tests | test-writer — TW-client (bg) | 1 | DONE (40 tests, 165 passed) | 166,470 | 51 | 259.9 s |
| 3 | tests | test-writer — TW-reviewer-core (bg, launched after #2) | 1 | DONE (6 tests, 60 passed) | 99,017 | 12 | 48.2 s |
| 4 | tests fix | SendMessage → #1 — relax AC-37 assertion to docs-only cap | 5 | DONE (79/80 it, failure = B2) | 174,346 ¹ | 3 | 35.1 s |
| 5 | spec amend | spec-creator — amend AC-37 sentence + Traceability hint | 4 | Amended, ready for approval | 26,497 | 7 | 12.0 s |
| 6 | verify | plan-verifier — full plan incl. T rows, extras R1–R9 | — | GAPS (277/281 met; V8 bad plan command, V11/V12/AC52 manual) | 147,443 | 43 | 208.2 s |
| 7 | UI fix 1 | test-writer — ContextAttachTab disabled handle | — | DONE (3 tests, 168 passed) | 55,541 | 6 | 27.3 s |
| 8 | UI fix 2 | test-writer — SkillsTab disabled-row drag (+1 intended test update) | — | DONE (4 tests, 172 passed) | 53,129 | 6 | 30.1 s |

¹ The resumed agent's notification reports 174,346 tokens. That figure is probably cumulative with #1 (172,588), but the notification doesn't say, so it is excluded from the totals below.

Main-session work outside dispatches:
- 1 AskUserQuestion gate (AC-37 cap reading).
- 2 manual `Status:` edits on SPEC-01 (approved → draft → approved), because `amend:` refuses non-draft specs.
- 2 production UI fixes done directly (no plan, per the bug-fix rule).
- 2 user turns spent on orchestration confusion: "run reviewer-core test-writer now too" after #3 had already reported, and "@plan-verifier stop" when no verifier was running.

## Tokens per phase
| Phase | Dispatches | Tokens | Share | Tool uses | Duration |
|---|---|---|---|---|---|
| tests (TW ×3) | 3 | 438,075 | 60.8% | 100 | 636.8 s (#1 ∥ #2) |
| tests fix (resume #1) | 1 | — ¹ | — | 3 | 35.1 s |
| spec amend | 1 | 26,497 | 3.7% | 7 | 12.0 s |
| verify | 1 | 147,443 | 20.5% | 43 | 208.2 s |
| UI-fix tests | 2 | 108,670 | 15.1% | 12 | 57.4 s |
| **Total** (excl. #4) | 7 | 720,685 | 100% | 165 | — |

## Deep metrics
not run

## Signals
- S1 — **plan-verifier re-checked everything.** It ran the whole plan, 281 rows, costing 147,443 tokens and 43 tool uses. The only change since run 2's `VERIFIED` was new test files plus one AC-37 clarification, so about 40 rows (T1–T33, the AC test columns, AC-37) could have changed. Scoped verification is still missing; both earlier retros recommended it.
- S2 — **The plan's `## Tests` table had gone stale against the amended spec.**
  - TW-server rewrote T1 to the current AC-1–3.
  - TW-client rewrote T22, T24 and T26 to the amended AC-2, AC-3 and AC-22.
  - Both added ACs no row covered: AC-47, 48, 49, 50, 51 and 53.
  - The main session had to warn both prompts by hand ("spec wins, paths may be outdated"). Nothing in `/run-plan` P1b passes the list of ACs amended after the plan's date.
- S3 — **AC-37 conflicted with itself, which cost 1 user gate, 1 resume (#4), 1 spec amend (#5) and 2 manual Status flips.**
  - The AC sentence capped "documents", the Traceability hint capped the "injected block", and plan T12 said "≤ 8,000 (+ notice)".
  - spec-creator's Step 5 self-check doesn't compare the hint's numbers and scope against its AC.
  - `amend:` on an approved spec has no documented path, so the main session improvised the draft round-trip.
- S4 — **Cold start dominated the small UI-fix tests.** The two test-writer dispatches cost 55,541 and 53,129 tokens for 3 and 4 tests (6 tool uses each, about 9k tokens per tool use). They came from two consecutive UI tweaks to the same drag-handle behaviour.
- S5 — **Plan Verification commands were wrong.** V7 and V8 have the path before `--`: `git grep -n "container.git" server/src/modules/context` and `git grep -nE "drizzle-orm" server/src/modules/context -- ':!*repository.ts'`. V8 exited 128 (a `partial` gap), and V7 "passed" without searching the path. The planner's red flags don't check pathspec placement.

## Recommendations
1. Add a scoped verify mode: `Scope: rows touching <changed files> + T rows + ACs <ids>`, used by `/run-plan` whenever the ledger shows a prior `VERIFIED` and only tests, extras or named ACs changed. — file: `.claude/agents/plan-verifier.md` (Step 0/1) and `.claude/skills/run-plan/SKILL.md` (P3) — because: S1 — RECURRING (3rd run)
2. In P1b, compute the ACs amended after the plan's `Date:` (spec `git log` / diff) and pass them to each test-writer as "spec wins for: AC-…". Also tell test-writer that `## Tests` file paths may be stale after a second implementation run. — file: `.claude/skills/run-plan/SKILL.md` (P1b step 2) — because: S2
3. Add a Step 5 self-check item: every Traceability hint uses the same number, unit and scope as its AC sentence (no stricter or different cap in the hint). — file: `.claude/agents/spec-creator.md` (Step 5) — because: S3
4. Document the approved-spec amend path. After the user approves a change in chat, the main session sets `Status: draft`, runs `spec-creator amend:`, and restores `Status: approved` in the same turn. — file: `.claude/agents/README.md` (Orchestration: "Spec follow-ups go through `amend:`") — because: S3
5. For a series of small UI tweaks without a plan, dispatch test-writer once after the batch, with one target list, instead of once per tweak. Also add a planner red flag for `git grep` Verification rows whose path comes before `--`. — file: `.claude/agents/README.md` (Orchestration) and `.claude/agents/implementation-planner.md` (Step 9) — because: S4, S5
