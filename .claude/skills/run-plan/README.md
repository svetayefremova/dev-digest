# /run-plan — Overview

## Motivation

Turning an approved plan into reviewed, verified code takes several agents in a fixed order, each with fix rounds. Run by hand, that flow drifts: rounds go on forever, findings already fixed come back, and an interrupted run can't resume. `/run-plan` makes the main session the single orchestrator, since subagents can't spawn subagents or ask the user. It runs implementer → check gate → test-writer → architecture-review fix loop → plan-verifier + security fix loop → doc-writer → `/pr-self-review`. It tracks every finding in a ledger, caps each loop at 2 fix rounds and stops to ask instead of looping.

## Where it sits in the SDD flow

```
request → spec-creator (manual) → human approves spec
        → implementation-planner (manual) → human approves plan
        → /run-plan docs/plans/<name>.md        ← this skill
        → human commits / opens PR
```

Out of scope: writing specs or plans, commits, pushes and PRs. `--no-tests` skips `test-writer` (tests are then recorded as **deferred**, not dropped).

## Usage

```
/run-plan docs/plans/<name>.md [--design <path|artifact-url>]... [--from implement|tests|arch|verify|docs|self-review] [--review-bugs] [--no-tests] [--no-security] [--no-docs] ["extra requirements"]
```

| Flag | Effect |
|---|---|
| `--design` | UI reference passed to the implementer. A claude.ai artifact URL is read and saved to the scratchpad first |
| `--from <phase>` | Resume from the ledger at that phase |
| `--review-bugs` | Also run `/code-review` in the verify loop (off by default to save tokens) |
| `--no-tests` | Skip test-writer (P1b); tests deferred, plan-verifier told `Tests deferred` |
| `--no-security` | Skip the P3 security pass |
| `--no-docs` | Skip the doc-writer phase |
| quoted text | Extra requirements; one that contradicts the plan triggers a question |

User-invoked only (`disable-model-invocation: true`). Refuses to run on `main`, on a `draft` plan without approval, or on a spec that still has `[NEEDS CLARIFICATION]` markers.

## Phases

| Phase | What happens | Agents / tools |
|---|---|---|
| P0 Intake | Parse args, branch and plan/spec status checks, create ledger | — |
| P1 Implement | Implementer per the plan's `## Execution` table (multi-agent: at most 2 workstreams in parallel), then `scripts/check.sh` gate | `implementer` |
| P1b Tests | One test-writer per `TW-*` row (at most 2 in parallel), from the plan's `## Tests` and the spec ACs; suspected defects become `tests` findings for the P3 loop | `test-writer` |
| P2 Architecture loop | Review → fix → `recheck:` (max 2 rounds) | `architecture-reviewer`, `implementer fix:` |
| P3 Verify loop | Plan verification + security pass (+ optional code review) → fix → test-writer for missing/wrong tests (max 2 rounds) | `plan-verifier`, security pass, `/code-review`, `test-writer` |
| P4 Docs | Feature docs from the plan | `doc-writer` |
| P5 Self-review | Final gate and summary with a suggested commit message | `/pr-self-review` |

## State: the ledger

`.claude/sdd-runs/<plan-name>.md` (gitignored). It holds the findings table with line-free **fingerprints** (`<source>:<rule|row id|check>:<file>`), states (`open → fixed | waived | needs-human | backlog`), waivers, backlog and the current phase. It drives resume (`--from`), oscillation detection (a fixed fingerprint reappearing stops the loop) and waiver forwarding to rechecks.

## Files

- `SKILL.md` — the orchestration procedure (arguments, ledger format, phases, triage table, stop conditions).
- `README.md` — this file.

## Keep in sync

The skill hard-codes agent names, their prompt shapes and report verdicts. When changing any of these, update `SKILL.md` too:

- `.claude/agents/implementer.md` — `fix:` mode, `workstream` arg, report fields (`Deviations`, `Dev DB`, `BLOCKED`/`PARTIAL`).
- `.claude/agents/architecture-reviewer.md` — `recheck:` mode, `PASS`/`NO_DIFF`/`FINDINGS`.
- `.claude/agents/plan-verifier.md` — `VERIFIED`, row verdicts (`met`/`partial`/`not met`/`not verifiable`).
- `.claude/agents/doc-writer.md`, the `pr-self-review` skill (`BLOCKED`).
- `scripts/check.sh` — flags `--related`, `--it`, `--no-typecheck`.
- `.claude/agents/implementation-planner.md` (plan template) and `docs/plans/README.md` — plan header (`Status:`, `Spec:`) and `## Execution` / `## Tests` sections.
- `.claude/agents/test-writer.md` — `package <pkg>` arg, extra items, report fields (`Suspected production defects`, `AC coverage`, `written, not run — docker unavailable`).
