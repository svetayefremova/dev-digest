# EARS Requirements — Overview & Sources

## Motivation

Spec Driven Development in this repo passes acceptance criteria through three agents: `spec-creator` writes them, `implementation-planner` turns each one into a traced `RQ`, and `plan-verifier` checks each one against code. If each agent read "acceptance criterion" its own way, the chain would break. The planner would reword triggers, and the verifier would accept vague evidence. This skill is the one shared contract for all three: EARS sentence patterns, the AC line format (`priority` + `verify` level), stable `AC-k` IDs, coverage rules, and ready-made AC patterns for LLM features. LLM features need those extras because PR content is attacker-controlled and model output is nondeterministic.

## Who uses it

| Consumer | How | What it takes from the skill |
|---|---|---|
| `spec-creator` | preloaded (`skills:` frontmatter) | Writing ACs: patterns, testability rules, LLM AC patterns, coverage rules, `[NEEDS CLARIFICATION]` instead of guesses |
| `implementation-planner` | preloaded | Every non-removed `AC-k` → at least one `RQ` with `source: SPEC-NN/AC-k`; never weaken a trigger, number or response |
| `plan-verifier` | preloaded (its only skill) | When an AC counts as `met`; `verify: manual` → `not verifiable`; `no <level> test` annotation |
| Humans | read `SKILL.md` | Reviewing a draft spec before setting `Status: approved` |

Not user-invocable as a command. It loads automatically for these agents, or on demand when a session works on `specs/**`.

## Files

- `SKILL.md` — the contract: AC line format, the five patterns, testability rules, LLM AC patterns, stable IDs, coverage rules, how the planner and verifier read ACs, a worked example.
- `README.md` — this file (motivation, consumers, maintenance, sources).

## Keep in sync

Changing the AC line format or the ID rules affects every consumer. Update these together:

- `.claude/agents/spec-creator.md` — its spec template and AC section.
- `.claude/agents/implementation-planner.md` — the RQ tracing and `ACs:` field per step.
- `.claude/agents/plan-verifier.md` — the AC verdict rules.
- `specs/README.md` — the writing rules and spec IDs sections.
- `.claude/skills/README.md` — the catalog row and the "Agent → preloaded skills" table.

Keep the frontmatter `description` free of `: ` (colon + space) and `<` / `>`. The first breaks YAML parsing and the second fails skill validation.

## Sources

### 1. EARS itself

- Alistair Mavin, Philip Wilkinson, Adrian Harwood, Mark Novak — "Easy Approach to Requirements Syntax (EARS)", 17th IEEE International Requirements Engineering Conference (RE'09), 2009. The original paper: five patterns (ubiquitous, event-driven, state-driven, unwanted behaviour, optional feature) and their keywords `WHEN` / `WHILE` / `IF … THEN` / `WHERE`.
- Alistair Mavin — [EARS](https://alistairmavin.com/ears/). The author's reference page with the pattern templates and the complex (combined) form used here as `WHILE <state>, WHEN <trigger>, the system shall …`.

### 2. Spec Driven Development conventions

- GitHub — [spec-kit](https://github.com/github/spec-kit). Source of the `[NEEDS CLARIFICATION: …]` marker convention and the "spec states what/why, plan states how" split this repo follows.

### 3. Repo-specific additions (not from EARS)

These rules are local decisions, not part of EARS. They are recorded here so nobody mistakes them for the standard:

- The `priority` (`must | should | could`, MoSCoW-style) and `verify` (`unit | integration | e2e | manual`) fields on every AC line. `verify` levels follow the testing strategy in `TESTING.md`.
- Stable, never-renumbered `AC-k` IDs cited as `SPEC-NN/AC-k`, and `Supersedes:` instead of editing an approved spec.
- The LLM AC checklist (provider failure, invalid structured output, prompt injection, output rendering, nondeterminism, cost, cancellation). It comes from DevDigest's injected `LLMProvider` design and its untrusted PR input.
