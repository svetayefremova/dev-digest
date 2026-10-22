# spec-creator — reference

Loaded on demand by [`spec-creator`](../agents/spec-creator.md). Read it **before writing a new spec or a full rewrite** (round 1, or round 2 when most of the file changes). Skip it in `amend` mode and for targeted round-2 Edits. Every rule here is binding when you write the sections it covers.

## Research requests (Step 1b format)

```
## Research requests
R1 — question: <one concrete question> — scope: <repo: package/area | external: library@version / API / topic> — done when: <what the answer must contain> — type: <repo | external | mixed>
R2 — ...
(1–4 requests, independent of each other so they can run in parallel; never ask what one Read/Grep would answer)
```

Each request must pass the `researcher` clarify gate on its own: a concrete question, a scope and a success criterion. The main session launches one `researcher` per request in the same message and resumes you with the reports labelled `R<n>`. Then continue at Step 2. Don't ask for research again in the same round; whatever is still unknown goes into `## Open questions`.

In round 2, ask for research only when an answer contradicts the code, a design or another answer, and research can settle it.

## NFR checklist

Walk every category for every spec. Each entry has a number or an EARS sentence, and either points to an AC (`→ AC-#`) or is marked `not testable → success signal`. A category that doesn't apply is written as `n/a — <reason>`; never drop it silently.
- **Performance:** a number the user feels (time to first content, p95 of an API call, poll interval, payload or list size limit).
- **Accessibility:** keyboard path, screen-reader names and announcements of state changes, focus after an action, contrast in light and dark mode.
- **Security & privacy:** who may see or trigger what, untrusted PR/model text rendering, rate and cost abuse, no secrets or tokens in logs and responses (see the threat checklist in `spec-creator.md`).
- **i18n:** all new copy lives in `client/messages/en/`, long-string behaviour, relative times and time zones.
- **Observability:** what the product records so a failure can be diagnosed (status, error reason, run id), without secrets.
- **LLM cost & limits:** only when the feature starts paid runs: who can start one, how a duplicate is prevented, what happens at the provider limit.

## Traceability

Every AC, including `(removed)` ones, has exactly one row in `## Traceability`:
- **Source:** where the requirement comes from: a request quote, a design file + element, `Q<n>` answer, an accepted UX proposal, `R<n>` (researcher), an INSIGHTS entry, or a `path:line` anchor.
- **Verification hint:** what a test or a reviewer should *observe* at the AC's `verify` level: the route or endpoint, the starting state, the action, and the expected visible text, HTTP status, or recorded event. Behaviour only, never how to implement it. Examples: "PR page with a failed run → Retry button visible and enabled" (unit), "POST the same review start twice within 1 s → second returns 409" (integration), "run against a live provider, reviewer judges summary quality" (manual).

Below the table, a reverse list proves coverage: every Edge case, Untrusted input, Module interaction and NFR → `AC-#` or `Non-goal`.


## Spec template (use exactly)

```markdown
# Spec: <feature name>

Spec ID: SPEC-NN
Status: draft
Module: <specs folder>
Date: <YYYY-MM-DD>
Supersedes: <[SPEC-NN](../<module>/SPEC-NN-<slug>.md) — what changes | —>

## Problem & user
<who has the problem, what it is today (path:line or design ref), why it matters>

## Goals / Non-goals
- Goals:
  - <outcome>
- Non-goals:
  - <explicitly out of scope>

## User stories
- US-1 — As a <user>, I want <capability>, so that <benefit>.

## Acceptance criteria (EARS)
- AC-1 — <EARS sentence with one shall> — covers: <US-#> — priority: <must | should | could> — verify: <unit | integration | e2e | manual> [— assumed default — confirm]
- AC-2 — ...

## Edge cases
- <edge case> → AC-#   (or → Non-goals)

## Non-functional requirements
- Performance: <number or EARS form> → <AC-# | not testable → success signal | n/a — reason>
- Accessibility: <...> → <...>
- Security & privacy: <...> → <...>
- i18n: <...> → <...>
- Observability: <...> → <...>
- LLM cost & limits: <...> → <...>

## Success signals
- <how we know it works after release: an observable event, count or metric the product already records or must record> → AC-# when it needs new behaviour

## Assumptions & dependencies
- <external: GitHub token scopes, LLM provider, config | other specs: SPEC-NN/AC-k> (or "None")

## Inputs and provenance
| Input | Source | Trust | Notes |
|---|---|---|---|
| <data the feature consumes> | <user / GitHub API / LLM output / DB / config> | <trusted / untrusted> | <path:line of contract, if any> |

Spec sources: <request (quote or summary)>, designs: <file paths>, code anchors: <path:line, ...>, research: <R1 (topic), ... | none>, mcp: <MCP get_conventions(owner/name), ... | none>
INSIGHTS applied: <package/INSIGHTS.md — entry → AC-# | Q# | Non-goal, ... | none relevant (read: <files>)>

## Untrusted inputs
- <input> — risk: <prompt injection / XSS / oversized / malformed> — required handling → AC-#

## Module interactions
| From → To | Contract / endpoint | Direction | Failure behaviour (user-visible) |
|---|---|---|---|
| client → server | <existing `path:line` | new> | request/response | → AC-# |

## Traceability
| AC | Covers | Source | Verify | Verification hint |
|---|---|---|---|---|
| AC-1 | US-1 | <request "quote" | design file + element | Q# | UX proposal | R# | INSIGHTS entry | path:line> | <unit | integration | e2e | manual> | <route/endpoint + state + action → expected visible text / HTTP status / event> |

Coverage:
- Edge cases: <case → AC-# | Non-goal>, ...
- Untrusted inputs: <input → AC-#>, ...
- Module interactions: <from → to → AC-#>, ...
- NFRs: <category → AC-# | success signal | n/a>, ...

## Design analysis
- Designs reviewed: <file paths / client routes>
- Gaps found:
  - <missing state or element> → <AC-# | Q#>
- UX proposals:
  - <proposal> — <proposed | accepted → AC-# | rejected: reason>

## Open questions
- Q1 [C#] — <question> — default: <answer> — <open | default used — assumed default — confirm>
(round 1: each open Q matches an inline `[NEEDS CLARIFICATION: …]` in the spec; round 2: no markers left)
(or "None")

## Glossary
- <term> — <meaning in this spec>
(only when the spec introduces new domain terms; otherwise omit the section)
```
