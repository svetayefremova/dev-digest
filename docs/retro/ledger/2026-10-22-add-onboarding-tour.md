# Workflow retro: docs/plans/add-onboarding-tour.md

Date: 2026-10-22 · Session: ac9af928 · Mode: deep
Commit: f93616a dirty
Wall clock: 9h30m (includes idle gaps between user turns and a rate-limit pause) · Dispatches: 33 subagents (spec-creator×1 resumed 13×, implementation-planner×1 resumed 3×, implementer×6, test-writer×7, plan-verifier×3, architecture-reviewer×3, general-purpose×8, doc-writer×1, Explore×1, fork×1) · Fix rounds: arch 0 (PASS r0, 2 rechecks), verify 2

## Timeline
| # | Phase | Agent (type — description) | Parallel with | Outcome | Tokens | Tool uses | Duration |
|---|---|---|---|---|---|---|---|
| 1 | spec (plan mode) | Explore — explore repo for onboarding tour | — | report | 62,489 | 15 | 77s |
| 2 | spec | spec-creator — SPEC-02 round 1 | — | draft + 4 Q | 72,084 | 16 | 171s |
| 3 | spec | spec-creator — resumes (round 2 + 12 amends: AC-50, AC-9, first tasks, show-all, AC-58 ×2, design paths, AC-32/33 ×2, AC-39/49 ×2, AC-37/48) | — | amended ×13 | 137,007 (cumulative at last resume) | — | — |
| 4 | plan | implementation-planner — round 1 | — | 3 decisions + mode | 89,405 | 9 | 84s |
| 5 | plan | implementation-planner — round 2 (write plan) | — | plan written | 164,071 (cum.) | 22 | 416s |
| 6 | plan | general-purpose (model: fable requested) — cross-model review | — | FAILED (rate limit), ran on opus-5-5 | — | — | — |
| 7 | plan | general-purpose (model: fable requested) — review retry | — | REVISE (2 B, 4 M, 7 m); ran on claude-opus-5-5 per transcript | 136,522 | 24 | 241s |
| 8 | plan | implementation-planner — revise round (review findings) | — | applied all | 206,009 (cum.) | 5 | 281s |
| 9 | plan | implementation-planner — revise round 2 (main-session review + B2 choice) | — | applied all | 242,996 (cum.) | 3 | 248s |
| 10 | P1 | implementer — W0 contract + schema | — | DONE | 83,764 | 7 | 56s |
| 11 | P1 | implementer — W1 server | #12 | DONE | 173,929 | 30 | 312s |
| 12 | P1 | implementer — W2 client | #11 | DONE | 148,260 | 24 | 242s |
| 13 | P1b | test-writer — TW-server | #14 | PARTIAL (1 defect repro, F1) | 205,407 | 58 | 414s |
| 14 | P1b | test-writer — TW-client | #13 | DONE | 191,962 | 69 | 328s |
| 15 | P2 | architecture-reviewer — review | — | PASS | 56,398 | 10 | 45s |
| 16 | P3 r0 | plan-verifier | #17 | GAPS (1 real) | 155,466 | 35 | 247s |
| 17 | P3 r0 | general-purpose — security pass | #16 | 2 MEDIUM | 86,479 | 9 | 54s |
| 18 | P3 r1 | implementer — fix F1–F3 | — | DONE | 81,247 | 9 | 111s |
| 19 | P3 r1 | test-writer — server F2/F3 | #20 | DONE | 83,274 | 16 | 104s |
| 20 | P3 r1 | test-writer — client F3 | #19 | DONE | 78,627 | 16 | 57s |
| 21 | P3 r1 | plan-verifier — re-verify | #22 | VERIFIED | 69,334 | 17 | 60s |
| 22 | P3 r1 | architecture-reviewer — recheck | #21 | PASS | 40,485 | 6 | 22s |
| 23 | P3 r2 | implementer — fix F4 | — | DONE | 65,265 | 7 | 43s |
| 24 | P3 r2 | test-writer — F4 | — | DONE | 58,437 | 8 | 61s |
| 25 | P3 r2 | plan-verifier — scoped | #26 | VERIFIED | 49,767 | 10 | 27s |
| 26 | P3 r2 | architecture-reviewer — recheck | #25 | PASS | 36,976 | 5 | 20s |
| 27 | P4 | doc-writer | — | PARTIAL (read plan to line 417) | 91,582 | 21 | 75s |
| 28 | post-run | test-writer — re-derive AC-39/AC-49 | #29 | DONE | 59,969 | 7 | 31s |
| 29 | post-run | general-purpose — test-vs-spec audit | #28 | 12 ACs flagged | 116,078 | 13 | 96s |
| 30 | post-run | implementer — aria-current (AC-2) | — | DONE | 59,001 | 6 | 47s |
| 31 | post-run | test-writer — server audit fixes | #32 | FAILED (rate limit) → resumed → DONE | 87,878 (cum.) | 4 | 60s |
| 32 | post-run | test-writer — client audit fixes | #31 | FAILED (rate limit) → resumed → DONE | 79,725 (cum.) | 3 | 20s |
| 33 | self-review | general-purpose ×4 — correctness / security / UI / backend | each other | 0 CRITICAL, 2 HIGH, 15 MEDIUM → OK | 90,329 / 89,587 / 125,979 / 120,393 | 14 / 13 / 16 / 18 | 65s / 60s / 71s / 72s |
| 34 | retro | fork — deep extraction | — | digest | 460,777 | 2 | 62s |

Usage cells come from the completion notifications; "cum." marks resumed agents, whose numbers are cumulative across resumes. No subagent spawned its own subagents (max depth 1).

## Tokens per phase
Tokens = cache write + cache read + output, from the deep digest.
| Phase | Dispatches | Tokens | Share | Cache write | Output |
|---|---|---|---|---|---|
| Spec (Explore + spec-creator) | 2 | 4.90M | 5% | 518k | 30.2k |
| Plan (planner + 2 reviews) | 3 | 7.21M | 8% | 606k | 100.1k |
| P1 implement (W0, W1, W2) | 3 | 6.29M | 7% | 385k | 7.8k |
| P1b tests | 2 | 7.64M | 8% | 384k | 50.6k |
| P2 arch | 1 | 0.38M | 0% | 54k | 0.1k |
| P3 verify + security + 2 fix rounds | 11 | 6.67M | 7% | 741k | 9.8k |
| P4 docs | 1 | 0.62M | 1% | 87k | 5.8k |
| Post-run spec audit + fixes | 5 | 3.45M | 4% | 529k | 13.1k |
| pr-self-review (4 passes) | 4 | 3.66M | 4% | 420k | 0.4k |
| Retro fork | 1 | 0.89M | 1% | 6k | 1.0k |
| Main session | 1 | 48.36M | 54% | 895k | 129.0k |
| **Total** | 34 | 90.09M | — | 4.62M | 347.9k |

## Deep metrics
Wall 9h30m · 33 subagents · max depth 1 · peak concurrency 4 · parallelism 1.93× · API calls 652 · cache hit 95% · tool calls 896 · API errors 6 (3 main, 3 rate-limited agents).
- Main: peak context 445.1k; 47.34M cache read; 176 tool calls (Bash 90, Agent 33, AskUserQuestion 20, SendMessage 19).
- spec-creator: 69 Edits across 14 handbacks; peak context 136.5k.
- implementation-planner: 99.4k output, the largest output of any subagent; peak context 241k.
- Shared reads:
  - `docs/plans/add-onboarding-tour.md` was read by 13 agents, often twice per agent. That gave 10 results of ≥20k chars, each 42k chars.
  - Read by several agents: the spec (8 agents), `server/INSIGHTS.md` (7), `onboarding/helpers.ts` (7), `client/INSIGHTS.md` (5).
- Truncated reads: the client F3 test-writer and doc-writer read the plan only to line 417.
- Re-reads: test-writer #31 re-read `server/test/onboarding.it.test.ts` 7×.
- Model check: dispatches #6 and #7 asked for `model: fable` but ran on `claude-opus-5-5`.

## Signals
- S1: The cross-model plan review was not cross-model. The two dispatches that requested `model: fable` (#6, #7) ran on claude-opus-5-5 per the transcript. The agent's self-report said "Fable 5.1", and the main session relayed that to the user without checking.
- S2: The post-run test-vs-spec audit (#29) flagged 12 of 55 audited ACs (1 MISMATCH, 4 CODE-DERIVED, 2 MISSING-partial, 5 WEAK) after plan-verifier had returned VERIFIED twice (#21, #25). plan-verifier confirmed coverage "by name prefix only" (#25 report). Fixing it cost 5 more dispatches, 3.45M tokens, 2 rate-limit failures and 2 spec amends.
- S3: Behaviour added by the P3 security fixes (redaction, link stripping) had no spec AC or plan RQ. test-writer labelled those tests AC-21 and AC-24, which the audit flagged as CODE-DERIVED. The fix was adding RQ58–RQ60 and T41–T43 afterwards.
- S4: spec-creator was resumed 13× after round 1, with 69 Edits and 20 AskUserQuestion gates in main.
  - 4 user follow-ups after "ready for approval" raised scope the round-1 questions never covered: what first tasks are, long lists / "show all", what happens with 200 files, TOC click.
  - 4 resumes only repaired one-shall or consistency defects: AC-9 duplicating AC-50, the AC-58 trigger, AC-32 and AC-49 two-shalls. Two of those came from wording the main session dictated verbatim.
- S5: The 42k-char plan exceeds the 25k Read cap. 13 agents read it, usually in 2 pages. 2 agents (doc-writer #27, test-writer #20) stopped at line 417, and doc-writer returned PARTIAL for that reason.
- S6: Main used 54% of all tokens (48.36M), with peak context 445k, because one context carried spec, plan, run-plan, audit, self-review and retro across 9h30m.
- S7: plan-verifier could not run 2 of the plan's 15 V-rows (V6 process substitution, V7 `xargs`) under `readonly-bash-guard`. 2 more rows (V5, V9) were false positives of the plan's own grep, matching the new `OnboardingSectionKey` and a test title. Main had to run and adjudicate all 4 by hand.
- S8: `/pr-self-review` Step 1 uses `git diff $(merge-base)`. That leaves out the 69 untracked feature files and pulls in 11 unmerged commits from earlier features (198 files), so the review needed a user scope question and a hand-computed hash.

## Recommendations
1. Verify the model a review ran on, from its transcript or a returned model id, never from the agent's self-report. If the model override didn't take effect, say the review was not cross-model, or route it through a `subagent_type` whose frontmatter pins the model (e.g. a dedicated `plan-reviewer` agent with `model: fable`). — file: `.claude/agents/README.md` (Orchestration), plus a new `.claude/agents/plan-reviewer.md` — because: S1
2. Make plan-verifier check AC assertion content, not only name prefixes. For every AC that fixes a literal (copy, limit, threshold, timeout, status), find the asserted literal in a test that cites the AC. Report "named but not asserted" as `partial`, and flag tests whose literal differs from the AC. — file: `.claude/agents/plan-verifier.md` (AC rows) — because: S2
3. In P3, when a fix adds behaviour that no AC states (security hardening, a review-driven rule), first add a plan-level `RQ`/`T` row for it. Then dispatch test-writer with that id, so tests never borrow an unrelated AC label. — file: `.claude/skills/run-plan/SKILL.md` (P3 fix round, before test-writer) — because: S3
4. Extend spec-creator's round-1 checklist:
   - for every list-shaped section, cover the item source, the cap, overflow / "show all", and the very-large-repo count;
   - for every interactive element in the design (TOC, cards, buttons), state what activating it does;
   - add a Step 5 self-check that rewrites user-dictated AC text to one `shall` and reports the rewrite, instead of keeping it verbatim.
   — file: `.claude/agents/spec-creator.md` (Round 1 categories, Step 5) — because: S4
5. Keep plans under the 25k Read cap, or tell agents to read them in pages. Either make the planner move the RQ list and Tests table to a sibling `<plan>.tests.md` when the plan exceeds ~600 lines, or add "read the plan to EOF (offset/limit pages); report the last line read" to the agents' Step 0. Also make Verification `check` rows readonly-guard-safe (no `<(…)`, no `xargs`) and anchored so they can't match names the plan itself adds. — file: `.claude/agents/implementation-planner.md` (Step 9 red flags), `.claude/agents/doc-writer.md`, `.claude/agents/test-writer.md` (Step 0) — because: S5, S7 — RECURRING (2nd run)
