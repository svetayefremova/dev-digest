# Workflow retro — docs/plans/add-blast-radius.md

Date: 2026-10-22 · Session: 48434cd1 · Mode: base
Commit: 237bd7c dirty
Wall clock: — (no timestamps in context; summed agent duration 870.7 s) · Dispatches: 17 (implementer×5, test-writer×6, architecture-reviewer×2, plan-verifier×2, general-purpose security×1, doc-writer×1) · Fix rounds: arch 0, verify 1

## Timeline
| # | Phase | Agent (type — description) | Parallel with | Outcome | Tokens | Tool uses | Duration |
|---|---|---|---|---|---|---|---|
| 1 | P1 W0 | implementer — contract | — | DONE | 61,687 | 4 | 24.9 s |
| 2 | P1 W1 | implementer — server | 3 | DONE | 74,666 | 7 | 38.2 s |
| 3 | P1 W2 | implementer — client | 2, 4 | DONE | 87,464 | 8 | 83.4 s |
| 4 | P1 W3 | implementer — mcp (launched when #2 finished) | 3 | PARTIAL (test fakes owned by TW-mcp) | 81,112 | 8 | 49.5 s |
| 5 | P1b | test-writer — mcp | 6 | DONE | 77,451 | 29 | 67.9 s |
| 6 | P1b | test-writer — server | 5, 7 | DONE | 85,584 | 26 | 118.8 s |
| 7 | P1b | test-writer — client (after #5) | 6 | DONE | 74,210 | 16 | 74.3 s |
| 8 | P2 | architecture-reviewer — full | — | PASS | 52,645 | 6 | 27.5 s |
| 9 | P3 | plan-verifier — full | 10 | GAPS (4 not verifiable, live only) | 52,070 | 12 | 59.5 s |
| 10 | P3 | general-purpose — security pass | 9 | No findings | 55,738 | 7 | 24.9 s |
| 11 | P3 r1 | implementer — fix F1 | — | DONE | 62,417 | 6 | 38.2 s |
| 12 | P3 r1 | test-writer — server F1 | 13 | DONE | 64,420 | 11 | 66.5 s |
| 13 | P3 r1 | test-writer — client F1 | 12 | DONE | 61,697 | 8 | 28.1 s |
| 14 | P3 r1 | test-writer — mcp F1 (after #13) | 12 | DONE | 53,373 | 8 | 28.3 s |
| 15 | P3 r1 | plan-verifier — scoped | 16 | GAPS (V3, V4 manual) | 47,821 | 14 | 63.8 s |
| 16 | P3 r1 | architecture-reviewer — recheck | 15 | PASS | 43,151 | 5 | 23.7 s |
| 17 | P4 | doc-writer | — | DONE | 54,820 | 11 | 53.2 s |

No SendMessage calls. Usage numbers cover each agent only; none reported spawning sub-agents.

## Tokens per phase
| Phase | Dispatches | Tokens | Share | Tool uses | Duration |
|---|---|---|---|---|---|
| P1 implement | 4 | 304,929 | 28.0% | 27 | 196.0 s |
| P1b tests | 3 | 237,245 | 21.8% | 71 | 261.0 s |
| P2 arch | 1 | 52,645 | 4.8% | 6 | 27.5 s |
| P3 verify + security | 2 | 107,808 | 9.9% | 19 | 84.4 s |
| P3 r1 (F1 fix, tests, recheck) | 6 | 332,879 | 30.5% | 52 | 248.6 s |
| P4 docs | 1 | 54,820 | 5.0% | 11 | 53.2 s |
| **Total** | 17 | 1,090,326 | 100% | 186 | 870.7 s |

## Deep metrics
not run

## Signals
- S1 — The only real defect (F1: a PR with no saved `pr_files` was reported as "index has no data") was found by the main session's live `curl` after P2 and the first P3 pass. No agent found it. The verifier marked the live rows `not verifiable` (#9). Fixing it cost a whole P3 r1: 6 dispatches, 332,879 tokens (30.5% of the run). The dev server is `tsx watch`, so the route was live right after P1.
- S2 — The F1 fix needed ~6 small tests across 3 packages, which meant 3 test-writer dispatches (#12–14): 179,490 tokens, 27 tool uses. Each cold start costs about 53–64k tokens, even when the agent makes only 8 tool calls.
- S3 — Every dispatch cost at least ~43k tokens no matter how much work it did. W0 (#1) changed one step in 2 files (the contract) and cost 61,687 tokens for 4 tool uses, and it serialised the start of W1 and W2.
- S4 — W3 (#4) came back PARTIAL because plan S8 told the implementer to update `mcp/test/fake-api.ts`, while the Execution table gave that file to TW-mcp, and the write-guard blocked it. The mcp gate stayed red until #5. This needed manual triage but no redo.
- S5 — Orchestration overhead: 3 user gates (branch on `main`, F1/F2 triage, and a plan question round before the run). There was also 1 failed `Skill("run-plan")` call from the main session, because the skill is `disable-model-invocation`.

## Recommendations
1. Add a "live smoke" step right after the P1 check gate. When a dev server is reachable (for example `curl -sf localhost:3001/...`), the main session runs the plan's Verification curl rows itself and turns any surprise into a `gate` finding before P1b. Then the tests and reviews see the fixed behaviour once, not twice. — file: `.claude/skills/run-plan/SKILL.md` (P1 step 3/5) — because: S1
2. In P3 fix rounds, let one test-writer take extra items for several packages (`packages server,client,mcp`) when the fix needs only a few tests per package. Keep one test-writer per package for P1b. — file: `.claude/skills/run-plan/SKILL.md` (P3 fix round) and `.claude/agents/test-writer.md` (arguments) — because: S2
3. Fold a contract-only workstream (one step, at most about 2 files, duplicated vendor copies) into the first dependent workstream. It can also be done by the main session before P1, as a recorded step. Don't give it its own implementer. — file: `.claude/agents/implementation-planner.md` (Step 8) — because: S3 — RECURRING (2nd run)
4. Add a planner red flag. When a step changes a port or interface that a test fake implements, the step text must not list the fake. The fake belongs only to the `TW-<pkg>` row. The plan's Tests table should state that the package's typecheck stays red until TW runs, and `/run-plan` should accept that state as an expected gate state. — file: `.claude/agents/implementation-planner.md` (Step 9 red flags) and `.claude/skills/run-plan/SKILL.md` (P1 step 2) — because: S4
5. In P0, when the current branch is `main`, offer to create `feat/<plan-slug>` in the same AskUserQuestion instead of refusing outright. — file: `.claude/skills/run-plan/SKILL.md` (P0 step 2) — because: S5
