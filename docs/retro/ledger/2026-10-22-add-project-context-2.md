# Workflow retro — docs/plans/add-project-context.md (run 2: amended-spec + UI delta)

Date: 2026-10-22 · Session: fcd8f189 · Mode: deep
Commit: 8cd68b4 dirty
Wall clock: 30m21s · Dispatches: 13 (spec-creator×2, implementation-planner×1 (stopped), implementer×2, architecture-reviewer×2, plan-verifier×2, general-purpose security×2, doc-writer×1, fork×1) · Fix rounds: arch 0, verify 1

## Timeline
| # | Phase | Agent (type — description) | Parallel with | Outcome | Tokens | Tool uses | Duration |
|---|---|---|---|---|---|---|---|
| 1 | pre-run (spec) | spec-creator — Amend SPEC-01 to match brief | — | amended, ready for approval | 50,221 | 21 | 88.0s |
| 2 | pre-run (plan) | implementation-planner — Rewrite plan for amended SPEC-01 | (received SendMessage with UI reqs) | stopped by user ("don't need a new plan"), wrote nothing | — | 20 (deep) | 6m40s (deep) |
| 3 | P1 | implementer — Implement run-2 delta (extras X1–X6, U1–U3) | — | DONE | 124,065 | 24 | 203.7s |
| 4 | P2 | architecture-reviewer — review of delta | — | PASS | 43,732 | 6 | 32.1s |
| 5 | P3 r0 | plan-verifier — plan + extras + amended spec | 6 | GAPS (AC-2/3/22 partial, U2 manual) | 132,478 | 27 | 242.4s |
| 6 | P3 r0 | general-purpose — security pass | 5 | 1 HIGH, 2 MEDIUM | 69,886 | 16 | 116.2s |
| 7 | P3 triage | spec-creator — Amend AC-2/3/22 per design | (overlapped 8) | amended, ready for approval | 43,817 | 11 | 29.1s |
| 8 | P3 r1 | implementer — fix F4 symlink | (overlapped 7) | DONE | 63,557 | 7 | 30.6s |
| 9 | P3 r1 | plan-verifier — scoped re-verify | 10, 11 | VERIFIED | 27,052 | 13 | 42.7s |
| 10 | P3 r1 | general-purpose — security recheck | 9, 11 | F4 fixed, no new | 56,888 | 8 | 81.5s |
| 11 | P3 r1 | architecture-reviewer — recheck fix | 9, 10 | PASS | 37,769 | 3 | 16.8s |
| 12 | P4 | doc-writer — update feature docs | — | DONE | 53,152 | 22 | 90.0s |
| 13 | retro | fork — deep extraction | — | digest | 167,438 | 2 | 34.4s |

`Tokens` = `<usage>` subagent_tokens. The deep table below counts cache reads too, so its totals are much larger.

## Tokens per phase
| Phase | Dispatches | Tokens | Share | Tool uses | Duration |
|---|---|---|---|---|---|
| pre-run (spec amend + planner) | 2 | 50,221 + — | 7.1%+ | 41 | 7m48s |
| P1 implement | 1 | 124,065 | 17.7% | 24 | 3m24s |
| P2 architecture | 1 | 43,732 | 6.2% | 6 | 32s |
| P3 r0 verify + security | 2 | 202,364 | 28.8% | 43 | 4m02s (parallel) |
| P3 triage spec amend | 1 | 43,817 | 6.2% | 11 | 29s |
| P3 r1 fix + rechecks | 4 | 185,266 | 26.4% | 31 | 2m22s |
| P4 docs | 1 | 53,152 | 7.6% | 22 | 1m30s |
| Total (excl. retro fork, planner unknown) | 12 | 702,617 | 100% | — | — |

## Deep metrics
Wall 30m21s · 13 subagents, depth 1 · peak concurrency 3 · parallelism 1.15x · API calls 182 · cache write 974.5k · cache read 13.97M · output 75.3k · cache hit 93% · tool calls 232 · API errors 0.

| Agent | Model | Cache write | Cache read | Output | Peak ctx | Tools | Duration |
|---|---|---|---|---|---|---|---|
| main | opus-5-5 | 128.1k | 5.33M | 30.1k | 155.7k | 51 | 30m15s |
| implementation-planner (stopped) | opus-5-5 | 175.5k | 1.99M | 29.0k | 175.5k | 20 | 6m40s |
| implementer (P1) | sonnet-5-5 | 121.5k | 1.94M | 473 | 121.5k | 24 | 3m23s |
| plan-verifier (full) | sonnet-5-5 | 117.0k | 1.80M | 404 | 119.2k | 27 | 4m02s |
| security pass | opus-5-5 | 68.3k | 857.9k | 176 | 68.3k | 16 | 1m55s |
| doc-writer | sonnet-5-5 | 48.6k | 410.3k | 2.2k | 51.4k | 22 | 1m29s |
| security recheck | opus-5-5 | 55.4k | 290.2k | 64 | 55.4k | 8 | 1m21s |
| spec-creator (amend 1) | sonnet-5-5 | 48.8k | 196.8k | 8.4k | 48.8k | 21 | 1m27s |
| implementer (fix) | sonnet-5-5 | 62.9k | 176.5k | 1.0k | 62.9k | 7 | 0m30s |
| architecture-reviewer | sonnet-5-5 | 42.3k | 182.3k | 76 | 42.3k | 6 | 0m31s |
| spec-creator (amend 2) | sonnet-5-5 | 43.3k | 147.9k | 2.3k | 43.3k | 11 | 0m28s |
| plan-verifier (scoped) | sonnet-5-5 | 18.8k | 145.1k | 139 | 25.8k | 13 | 0m42s |
| architecture-reviewer (recheck) | sonnet-5-5 | 34.4k | 34.2k | 18 | 36.6k | 3 | 0m16s |

Files read by several agents: SPEC-01 (5 agents, 35–41k chars each), `checkout.ts` (3), extras file (3), both design PNGs (2), `service.ts` (2), plan (2, 54.7k chars).
Large results: plan read whole by planner and full verifier (54.7k each); spec read whole 5×; one 25.8k Bash dump read by both verifier and security pass.

## Signals
- S1 — The implementation-planner ran 6m40s (≈2.17M tokens incl. cache, the largest subagent) and was stopped because the user wanted the delta run through `/run-plan` extras, not a new plan. Zero output was used.
- S2 — The design-vs-spec conflict (list rows without badge and tokens, "{n} attached" pill vs AC-2/AC-3/AC-22) was known when the extras were written. It surfaced only at P3 r0 verifier GAPS, which cost a mid-run spec amendment (dispatch 7), 2 extra gate questions and a spec approval gate.
- S3 — The full plan-verifier for a delta run cost ≈1.92M tokens and 27 tools, and re-verified all 233 plan rows, including run-1 rows that were unchanged. The scoped re-verify cost ≈164k (≈12×) less. Run 1's retro recommended the same scoping.
- S4 — 5 AskUserQuestion gates. One existed only because the MEDIUM-triage multiSelect accepted contradictory answers ("Fix F5", "Fix F6" and "Backlog both" together). Also, `/run-plan` could not be started by the session (`disable-model-invocation`), and the user's own invocation carried no extras, so the extras were reconstructed from chat into `.claude/sdd-runs/add-project-context.extras.md`.
- S5 — The security pass, added after run 1's retro, caught a real HIGH: a symlink to `.git/config` leaked the clone token into the preview and the prompt. It also raised a MEDIUM about missing path allowlisting. The planner had not required an allowlist for the user-supplied path endpoint. Run 1's retro recommended the same.

## Recommendations
1. Support a delta mode. When the ledger shows a prior run at P5 and extras are passed, scope plan-verifier to the extras plus the ACs they name and the rows touching changed files. Don't re-run all plan rows. — file: `.claude/skills/run-plan/SKILL.md` (P3 Verify) and `.claude/agents/plan-verifier.md` — because: S3 — RECURRING (2nd run)
2. In P0, when designs or extras are passed, diff them against the spec's ACs before P1. On any conflict, ask "amend spec / follow spec" up front, and route an amend to spec-creator before implementing. — file: `.claude/skills/run-plan/SKILL.md` (P0 step 4) — because: S2
3. After a spec amendment on a plan that is already implemented, default to `/run-plan <plan> --extras <file>` and don't re-dispatch implementation-planner. Accept an extras file path as an argument, so the user's own invocation carries them. — file: `.claude/skills/run-plan/SKILL.md` (Arguments) and `.claude/agents/README.md` (orchestration rules) — because: S1, S4
4. Make the SUGGESTION/MEDIUM triage gate ask one single-select question per finding (fix now / backlog / waive), not one multiSelect over mixed options. — file: `.claude/skills/run-plan/SKILL.md` (Triage) — because: S4
5. Require every step that reads a user-supplied path to state an explicit allowlist: it must be in the scanned list, symlinks are refused, and directory exclusions are case-insensitive. Add it as a planner red flag. — file: `.claude/agents/implementation-planner.md` (Step 9 red flags) — because: S5 — RECURRING (2nd run)
