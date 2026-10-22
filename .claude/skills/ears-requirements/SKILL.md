---
name: ears-requirements
description: EARS acceptance criteria for DevDigest feature specs (specs/MODULE/SPEC-NN-*.md) — the five EARS patterns, the one-shall rule, testable wording, the AC line format (priority + verification level), stable AC IDs, and ready-made AC patterns for LLM features (degraded mode, invalid model output, prompt injection, cost). Use when writing, planning from, or verifying against acceptance criteria — spec-creator writes them, implementation-planner traces every AC-k to an RQ, plan-verifier checks each AC-k against code.
---

# EARS requirements

One shared reading of acceptance criteria. `spec-creator` writes them, `implementation-planner` turns each into an `RQ`, `plan-verifier` checks each against code. All three follow this file.

## AC line format

```
- AC-k — <one EARS sentence> — covers: US-# — priority: must | should | could — verify: unit | integration | e2e | manual [— assumed default — confirm]
```

- **`priority`**: `must` = the feature is not done without it. `should` = expected, may move to a follow-up plan if the user agrees. `could` = nice to have. A planner may phase `should`/`could` ACs but never rewords them.
- **`verify`**: the cheapest level that can observe the response.
  - `unit`: a pure function or one component (reviewer-core, client RTL, server service).
  - `integration`: an API route with a real DB (`app.inject`, Testcontainers).
  - `e2e`: needs the running app in a browser (`e2e/`).
  - `manual`: needs a live LLM, real GitHub or a human judgement. Use it rarely. `plan-verifier` reports these as `not verifiable`, so a spec where most ACs are `manual` is a weak spec.

## The five patterns

Every AC is exactly **one** EARS sentence with exactly **one** `shall`.

| Pattern | Shape | Example |
|---|---|---|
| Ubiquitous | The system shall … | The review API shall reject requests without a workspace id. |
| Event-driven | WHEN <trigger>, the system shall … | WHEN the user clicks Retry on a failed review, the PR page shall start a new review run. |
| State-driven | WHILE <state>, the system shall … | WHILE a review run is in progress, the PR page shall show its elapsed time. |
| Unwanted behaviour | IF <unwanted condition>, THEN the system shall … | IF the GitHub token is revoked, THEN the PR page shall show a reconnect action instead of the diff. |
| Optional feature | WHERE <feature is enabled>, the system shall … | WHERE smart diff is enabled, the diff tab shall group files by finding count. |

Patterns combine: `WHILE <state>, WHEN <trigger>, the system shall …`. "The system" may be narrowed to a named part (`the PR page`, `the review API`, `the MCP server`).

## Testability rules

An AC is testable only if it has an **observable trigger or state** and an **observable response**.

- Concrete numbers instead of adjectives: "within 2 s", "at most 50 items", "after 3 failed attempts".
- Named UI elements and real copy keys, not "an appropriate message".
- One response per AC. Split on "and" when the two parts can fail separately.
- No implementation: no file, table, function or library names. Name an existing endpoint or contract only when the behaviour depends on it.

| Vague | Testable |
|---|---|
| "Should work fine on large repositories" | WHEN the repository exceeds the indexing threshold, the system shall build the overview from deterministic facts only, without reading every file in full. |
| "Should not crash if the model is unavailable" | IF the structured model call fails, THEN the system shall show the deterministic overview with the reason for degradation. |
| "Should suggest where to start reading" | The system shall order the reading path by file rank in the import graph. |
| "Fast" | WHEN the user opens the findings tab, the tab shall render the first 50 findings within 1 s for a PR with 500 findings. |

## AC patterns for LLM features

DevDigest calls an LLM through an injected `LLMProvider`, and PR content is attacker-controlled. Check each of these for every feature that calls the model or renders model output. Each one gets an AC or a Non-goal.

- **Provider down or timeout:** IF the model call fails or exceeds <N> s, THEN the system shall <degraded behaviour> and show the reason.
- **Invalid structured output:** IF the model output does not match the expected contract, THEN the system shall <discard / retry once / show partial> and record the failure.
- **Prompt injection:** The system shall treat PR titles, descriptions, diffs and comments as data, so that instructions inside them do not change the agent's task or tools.
- **Rendering model output:** The system shall render model output as text, without executing HTML or scripts from it.
- **Nondeterminism:** the AC states what must hold for *any* valid model answer (shape, ordering rule, limits), never the exact wording.
- **Cost:** WHEN a user starts a paid run, the system shall <show the estimate | require confirmation | enforce a limit>.
- **Cancellation:** WHILE a run is in progress, WHEN the user cancels, the system shall stop the run and keep the previous result.

## Stable IDs

- `AC-1`, `AC-2`, … per spec. Numbers are never reused or renumbered across rounds. A dropped AC stays as `AC-k (removed) — <reason>`.
- Other documents cite an AC as `SPEC-NN/AC-k`.
- Changing an approved spec means a new spec with `Supersedes: SPEC-NN`, never an edit.

## Coverage rules

- Every edge case, error state, untrusted input and module-interaction failure in the spec maps to an AC or to a Non-goal.
- Every user story is covered by at least one `must` AC.
- `[assumed default — confirm]` on an AC must match an open question in the spec.
- An AC never contains a guessed value. While unknown it carries `[NEEDS CLARIFICATION: <question>]`; a spec with any marker left is not ready for planning.
- Every AC has exactly one row in the spec's `## Traceability` table: its source and a behaviour-only **verification hint** (state + action → observable response at the AC's `verify` level). The AC line format itself does not change.

## Reading ACs (planner and verifier)

- **Planner:** every AC not marked `(removed)` becomes at least one `RQ` with `source: SPEC-NN/AC-k`. Its `verify:` level decides which test the plan asks for, and every plan step that implements it lists `SPEC-NN/AC-k` in its `ACs:` field. Never weaken a trigger, a number or a response. The AC's Traceability hint may be copied into the covering step's test expectation.
- **Verifier:** an AC is `met` only with evidence of the stated trigger/state → response (code `path:line`, or a test that asserts it). When no test exists at the AC's `verify` level, keep the verdict and add `no <level> test` to the row. `verify: manual` → `not verifiable`. Use the AC's Traceability hint to find the asserting test; the EARS text stays the contract.

## Example

```
## User stories
- US-1 — As a reviewer, I want to retry a failed review, so that I don't have to reopen the PR.

## Acceptance criteria (EARS)
- AC-1 — WHILE a review run has status failed, the PR page shall show a Retry button next to the failure reason. — covers: US-1 — priority: must — verify: unit
- AC-2 — WHEN the user clicks Retry, the review API shall start a new run for the same PR head SHA. — covers: US-1 — priority: must — verify: integration
- AC-3 — WHILE a retried run is in progress, the PR page shall disable the Retry button. — covers: US-1 — priority: must — verify: unit
- AC-4 — IF the PR head SHA changed since the failed run, THEN the PR page shall label the retry "Review latest commit". — covers: US-1 — priority: should — verify: unit
- AC-5 (removed) — merged into AC-3 in round 2.
```
