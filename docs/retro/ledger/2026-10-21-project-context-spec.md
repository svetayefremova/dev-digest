# Workflow retro — project-context spec (SPEC-01, spec-creator flow)

Date: 2026-10-21 · Session: dd2772de · Mode: base
Commit: 8cd68b4 dirty
Wall clock: — · Dispatches: 4 (spec-creator Agent×2, SendMessage×2) · Fix rounds: —

## Timeline
| # | Phase | Agent (type — description) | Parallel with | Outcome | Tokens | Tool uses | Duration |
|---|---|---|---|---|---|---|---|
| 1 | Spec R1 | spec-creator — Project Context spec round 1 (bg; told "plan mode: no file, return draft inline") | — | Draft inline (browse-only scope, 16 AC) + 8 Qs | 90,008 | 30 | 501.5 s |
| 2 | Spec R2 | SendMessage → #1 — Round 2 answers (full scope, write file) | — | Spec written, 46 AC, Q9/Q10 assumed defaults | 121,028 ¹ | 9 ¹ | 189.0 s ¹ |
| 3 | Spec R2 amend | SendMessage → #1 — footer: chunks → token total (queued mid-run) | merged into #2 | Applied via full Write rewrite (Edit unavailable) | ¹ | ¹ | ¹ |
| 4 | Spec amend | spec-creator — resolve Q9/Q10 (new run, after Edit was enabled) | — | 5 Edits, 5 lines changed, 0 markers | 33,553 | 9 | 21.3 s |

¹ #2 and #3 ran in one resumed turn. They produced one completion notification, so the numbers are combined.

Main-session work outside dispatches:
- 3 AskUserQuestion calls for the spec (8 Qs in total), 1 to clarify "overwrite vs new", and 1 approval gate.
- 4 ExitPlanMode calls, 1 of them rejected.
- 1 manual spec patch (acme removal) that should have gone to the agent.
- spec-creator tooling fix: Edit plus the `Write|Edit` guard.

## Tokens per phase
| Phase | Dispatches | Tokens | Share | Tool uses | Duration |
|---|---|---|---|---|---|
| Spec R1 | 1 | 90,008 | 36.8% | 30 | 501.5 s |
| Spec R2 + amend | 2 | 121,028 | 49.5% | 9 | 189.0 s |
| Spec amend (Edit) | 1 | 33,553 | 13.7% | 9 | 21.3 s |
| **Total** | 4 | 244,589 | 100% | 48 | 711.8 s |

## Deep metrics
not run

## Signals
- **S1 — plan mode during R1.**
  - The session was in plan mode, so R1 was told to write no file and return the draft inline.
  - R2 then had to produce the whole file from scratch: 121k tokens, 49.5% of the run.
- **S2 — R1 narrowed the scope.**
  - The user described one feature (browse + attach + inject + trace).
  - R1 drafted browse only, with 16 AC, and proposed a 3-way split (Q1).
  - The user picked "one spec", so R2 had to rewrite to 46 AC.
- **S3 — Edit was disallowed for spec-creator.**
  - The footer amendment was applied by rewriting the whole file (#3).
  - The main session hand-patched the spec (acme), and the user flagged that the agent lacked update access.
  - After the fix, a comparable amendment cost 33.5k tokens, 9 tool uses and 21 s (#4).
  - Already fixed this session in `.claude/agents/spec-creator.md` and the guard.
- **S4 — low-value questions.**
  - 3 of 8 clarifying questions came back as "skip" or "pick the best": tokens, coverage, run-time rules.
  - So defaults were used anyway, and 2 further assumed defaults (Q9/Q10) needed a separate amend dispatch (#4).
- **S5 — approval gate was not built in.**
  - The user had to ask for approval to be requested in chat.
  - Until then the main session told them to edit `Status:` by hand.
  - Already added to `.claude/agents/README.md`.

## Recommendations
1. Default to one spec when the request describes a single feature. Offer a split only as a question, and draft the full requested scope. Never draft a narrowed scope ahead of the answer. — file: `.claude/agents/spec-creator.md` (Step 0 / C1 scope) — because: S2
2. Don't launch spec-creator R1 read-only under plan mode. Exit plan mode first, or treat spec-creator as allowed in plan mode, so R1 writes the draft and R2 edits it. — file: `.claude/agents/README.md` (orchestration rules) — because: S1
3. Ask only questions whose answer changes behaviour or scope. Put minor values (formats, counting method, edge defaults) straight into the spec as "assumed default — confirm", and list them once at the approval gate. — file: `.claude/agents/spec-creator.md` (Step 2b / clarifying questions) — because: S4
4. End the round-2 return with a fixed `Ready for approval: yes|no` line. That lets the main session trigger the chat approval gate mechanically. — file: `.claude/agents/spec-creator.md` (return format) — because: S5
