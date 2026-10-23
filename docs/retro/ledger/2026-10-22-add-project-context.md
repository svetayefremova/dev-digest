# Workflow retro — docs/plans/add-project-context.md

Date: 2026-10-22 · Session: 932cec23 · Mode: base
Commit: 8cd68b4 dirty
Wall clock: — (no timestamps in context) · Dispatches: 17 (Explore×2, implementer×5, architecture-reviewer×2, plan-verifier×2, doc-writer×1, general-purpose×5) · Fix rounds: arch 0, verify 1

Scope: from the first Agent call (planning exploration, 2026-10-21) through `/run-plan` P0–P4 and the user-run `/pr-self-review` (P5) plus the one manual fix after it. The plan itself was written inline by the main session (no implementation-planner dispatch).

## Timeline
| # | Phase | Agent (type — description) | Parallel with | Outcome | Tokens | Tool uses | Duration |
|---|---|---|---|---|---|---|---|
| 1 | planning | Explore — server+core anchors | 2 | report | 104,993 | 33 | 155 s |
| 2 | planning | Explore — client anchors | 1 | report | 97,294 | 29 | 164 s |
| 3 | P1 W0 | implementer — contracts + DB | — | DONE | 93,033 | 8 | 67 s |
| 4 | P1 W2 | implementer — server | 5 | DONE (4 deviations) | 117,974 | 13 | 122 s |
| 5 | P1 W3 | implementer — client | 4, 6 | DONE (5 deviations) | 129,026 | 21 | 224 s |
| 6 | P1 W1 | implementer — reviewer-core | 5 (launched when 4 finished) | DONE | 83,138 | 7 | 33 s |
| 7 | P2 | architecture-reviewer — full diff | — | PASS | 52,313 | 8 | 35 s |
| 8 | P3 r0 | plan-verifier — full | — | GAPS (S10.F4 partial; V2/V3 pre-existing) | 108,188 | 25 | 183 s |
| 9 | P3 r1 | implementer — fix F1 (skipHtml) | — | DONE | 58,803 | 8 | 28 s |
| 10 | P3 r1 | plan-verifier — re-verify | 11 | GAPS (pre-existing only) | 47,442 | 8 | 81 s |
| 11 | P3 r1 | architecture-reviewer — recheck | 10 | PASS | 35,056 | 2 | 20 s |
| 12 | P4 | doc-writer — feature doc | — | DONE | 72,600 | 14 | 54 s |
| 13 | P5 | general-purpose — code-review medium | 14–17 | no CRIT/HIGH, then late correction +2 HIGH | 118,259 † | 26 | 142 s |
| 14 | P5 | general-purpose — security | 13, 15–17 | 1 CRITICAL | 85,722 | 24 | 121 s |
| 15 | P5 | general-purpose — UI skills | 13, 14, 16, 17 | 4 HIGH | 80,716 | 18 | 101 s |
| 16 | P5 | general-purpose — backend skills | 13–15, 17 | 1 HIGH | 79,355 | 13 | 61 s |
| 17 | P5 | general-purpose — zod contracts | 13–16 | MEDIUM only | 49,827 | 8 | 33 s |

† #13 spawned its own background `code-review` fork; that fork's tokens are not included.

## Tokens per phase
| Phase | Dispatches | Tokens | Share | Tool uses | Duration (sum) |
|---|---|---|---|---|---|
| planning (explore) | 2 | 202,287 | 14% | 62 | 319 s |
| P1 implement | 4 | 423,171 | 30% | 49 | 446 s |
| P2 architecture | 1 | 52,313 | 4% | 8 | 35 s |
| P3 verify loop | 4 | 249,489 | 18% | 43 | 312 s |
| P4 docs | 1 | 72,600 | 5% | 14 | 54 s |
| P5 pr-self-review | 5 | 413,879 † | 29% | 89 | 459 s |
| **Total** | 17 | 1,413,739 | 100% | 265 | — |

## Deep metrics
not run

## Signals
- S1 — The only CRITICAL (`GET /repos/:id/context/file` read any file, incl. `.git/config` with the clone PAT) passed implementer, architecture-reviewer (PASS ×2) and plan-verifier (all RQ met ×2). It was caught only by the P5 security pass (#14). `/run-plan` P1–P4 has no security pass, although the plan's `## Out of scope / handed off` listed "Security review → security reviewer agent" for exactly this file. The plan step S6 / AC-18 specified traversal checks but no extension allowlist.
- S2 — plan-verifier r0 (#8) cost 108k tokens / 25 tool uses / 183 s, enumerated 263 rows (75 of them `deferred` test rows), and re-ran every `scripts/check.sh` suite, including `server --it`, which the P1 check gate had already run. r1 (#10) re-ran all suites again. Both runs reported V2/V3 as `partial` / `not verifiable` because they could not confirm the failures were pre-existing.
- S3 — Pre-existing failing tests (`contracts.test.ts` deterministic, `reviews.it.test.ts` flaky) blocked the check gate's classification. The main session had to build a temporary HEAD worktree and re-run the suites by hand (two extra test runs, about 2 min) before P2 could start.
- S4 — `/run-plan` P5 `Skill("pr-self-review")` failed with `disable-model-invocation`. The run stopped at P5, and the user needed 3 attempts to start it (twice a leading space turned the command into plain text), which cost 2 wasted turns.
- S5 — W1 (#6) was a one-file regex change (`reviewer-core/src/prompt.ts`). It cost 83k tokens for 7 tool uses (≈ 12k per tool use, versus ≈ 9k for W2), mostly cold-start context for a step that fits in W2.
- S6 — 3 of the 5 P5 UI HIGH findings (ArrowDown focus loss = AC-24, overlapping-save rollback = AC-32, unnamed Attached toggle = AC-28) map to deferred test rows T27/T28/T30. With test-writer off, no gate exercised behaviour, only code reading.
- S7 — P5 pass #13 handed back before its nested background `code-review` fork finished. It sent a late correction with 2 more HIGH findings after the verdict cache was written, which forced a cache patch.

## Recommendations
1. Add a security pass to P3 (`/security-review`, or the `security` skill via a general-purpose dispatch) whenever the diff adds or changes a route that takes user input or touches the filesystem, and treat its CRITICAL/HIGH findings like verifier gaps. — file: `.claude/skills/run-plan/SKILL.md` (P3) — because: S1
2. In P0, run `scripts/check.sh <pkg>` on the base (or record known failures from the previous run's ledger) as a baseline. Classify check-gate failures against it automatically, and pass that classification to plan-verifier so it marks matching V-rows `pre-existing` instead of `partial`. — file: `.claude/skills/run-plan/SKILL.md` (P0, P1 step 3) — because: S3, S2
3. Let plan-verifier reuse the check-gate output passed in its prompt, and re-run only the packages touched since the gate. Collapse all `deferred` T rows into one summary line instead of enumerating them. — file: `.claude/agents/plan-verifier.md` — because: S2
4. Replace `Skill("pr-self-review")` in P5 with a stop that tells the user to type `/pr-self-review` (no leading space), since the skill is `disable-model-invocation`. — file: `.claude/skills/run-plan/SKILL.md` (P5) — because: S4
5. In the plan's execution design, merge a workstream that has a single step of ≤ 1 file into a neighbouring workstream with no owned-path overlap, instead of giving it its own implementer. Also require an explicit input allowlist (extension or segment rules) in any step that adds an endpoint taking a user-supplied path. — file: `.claude/agents/implementation-planner.md` (Step 8, Step 9 red flags) — because: S5, S1
