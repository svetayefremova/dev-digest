# specs

Feature specifications for Spec Driven Development. A spec states **what** the product must do and **for whom**, as testable EARS acceptance criteria, before any plan or code exists. Specs are written by the [`spec-creator`](../.claude/agents/spec-creator.md) agent; this README is human-maintained.

Flow: request (+ designs) → `spec-creator` (round 1: draft + questions → answers → round 2) → human sets `Status: approved` → `implementation-planner <spec path>` → `implementer` (production code) → check gate → `test-writer` (tests named `AC-k: …` for every `verify: unit | integration` AC) → `plan-verifier` (checks every `AC-k`) ∥ reviewers → fix loop → human sets `Status: implemented`.

## Layout

```
specs/
  README.md
  <module>/
    SPEC-NN-<slug>.md
```

- `<module>` is a product feature or domain, not a package. Reuse an existing folder, or match the name of `server/src/modules/<name>` or `client/src/app/<route>` when one exists (`smart-diff`, `reviews`, `onboarding`, …). A feature that spans client and server still lives in one folder.
- Folder and slug names use lowercase kebab-case.

## Spec IDs

- `SPEC-NN` is **global** across all modules: the next spec takes `max(NN) + 1` over `specs/**`, two digits minimum (`SPEC-01`).
- The file name carries the ID: `SPEC-07-retry-failed-reviews.md`. The file's `Spec ID:` line must match it.
- Acceptance criteria are `AC-1`, `AC-2`, … inside a spec and are cited elsewhere as `SPEC-NN/AC-k`. Their numbers never change; a dropped criterion is marked `(removed)`.

## Lifecycle

| Status | Set by | Meaning |
|---|---|---|
| `draft` | `spec-creator` | Still being shaped; the agent may overwrite it. |
| `approved` | human, only when `grep -c 'NEEDS CLARIFICATION'` is 0 | Frozen; plans are built on it. The agent's write guard refuses to touch it. |
| `implemented` | human, after `plan-verifier` returns `VERIFIED` | Describes shipped behaviour. |
| `superseded` | human, when a newer spec says `Supersedes: SPEC-NN` | History only; the newer spec is the source of truth. |

To change an approved or implemented spec, write a **new** spec with `Supersedes: SPEC-NN` and say what changes. Once the new spec is approved, set the old one to `Status: superseded`; it stays as history.

## Writing rules

- Template: [`spec-creator.md` → Spec template](../.claude/agents/spec-creator.md#spec-template-use-exactly). Sections: Problem & user, Goals / Non-goals, User stories, Acceptance criteria (EARS), Edge cases, Non-functional requirements, Success signals, Assumptions & dependencies, Inputs and provenance, Untrusted inputs, Module interactions, Design analysis, Open questions, Glossary (optional).
- AC rules (line format with `priority` and `verify`, patterns, LLM patterns, coverage): [`ears-requirements` skill](../.claude/skills/ears-requirements/SKILL.md).
- English only. EARS triggers: `WHEN` (event), `WHILE` (state), `IF … THEN` (unwanted behaviour), `WHERE` (optional feature), or none (ubiquitous). Exactly one `shall` per criterion.
- Behaviour, not implementation: no file lists, layers or schemas (that's the plan's job).
- **No guesses.** An unknown the spec needs is written inline as `[NEEDS CLARIFICATION: <question>]` with a matching `Q<n> [C#]` under Open questions (categories C1–C6: scope, users & permissions, data & domain, UX flow & states, failures & edge cases, non-functional). A spec that still contains a marker must not be set to `approved`; `implementation-planner` returns `BLOCKED` on it.
- **What vs how.** The spec owns every product question. `implementation-planner` only decides how and in which order, and cites `SPEC-NN/AC-k` on every plan step.

## Designs

Designs are inputs, not spec content.
- **Screenshots** can live at any local path. Pass the path to the agent; the spec references it.
- **Claude Design artifacts:** the main session reads the artifact and saves its HTML or screens locally, then passes those paths.
- **Existing UI** in `client/src/app/**` counts as the current design.

The agent never copies or writes design files. Commit a design next to the spec yourself if it should be kept with the history.

## Enforcement

`spec-creator` can write only `specs/<module>/SPEC-NN-<slug>.md` with `Status: draft`, a matching unique ID, and never a `README.md`. This is enforced by [`.claude/hooks/spec-creator-write-guard.sh`](../.claude/hooks/spec-creator-write-guard.sh) (PreToolUse on Write, fails closed). Its Bash is read-only via `readonly-bash-guard.sh --profile readonly`.
