# reviewer-core — CLAUDE.md

`@devdigest/reviewer-core` — pure review engine: prompt assembly, citation grounding, structured output, reduce, `reviewPullRequest`.

## Stack

TypeScript 5.7 (ESM, run via `tsx`), OpenAI SDK, Zod 3, Vitest 2.

## Commands

```
npm run typecheck   # tsc --noEmit -p tsconfig.json
npm run build         # tsc --noEmit -p tsconfig.json (type-check only, no emit)
npm test                # vitest run --passWithNoTests
```

## Map

- `src/grounding.ts` — citation grounding
- `src/prompt.ts` — prompt assembly
- `src/llm/` — LLM provider interface
- `src/output/` — structured output handling
- `src/review/` — review pipeline / `reviewPullRequest`
- `src/index.ts` — public API surface

## Gotchas / do not

- No DB, GitHub, or filesystem access here — the only allowed side effect is the injected `LLMProvider`. Any such access belongs in `server`, not here.
- Consumed by `server` via tsconfig path alias, not as an npm dependency — don't assume it's published.

## Read when

- `README.md` — when you need the pipeline diagram and public API.
- `docs/` — when you need prior design-decision context for this module.
- `specs/` — when implementing a feature that has a written spec here.
- `INSIGHTS.md` — read FIRST, before any work in this module, every session. Mandatory, not just for nontrivial tasks.
- `../TESTING.md` — when touching tests.
