# client — INSIGHTS

Append-only log of engineering insights captured in `client/`. Written by the `engineering-insights` skill (proactively, or via `/engineering-insights` at the end of a session/task). Read this before nontrivial work in this module — treat it as high-confidence guidance unless something here is clearly outdated.

**Rules:** never overwrite an entry — append a new dated correction instead. Each entry: date + concrete fact + `file:line` where applicable. Skip anything obvious from reading the code.

## What Works

<!-- - 2026-XX-XX — approach that worked, and why (file:line) -->

## What Doesn't Work

<!-- - 2026-XX-XX — dead end / antipattern, and why it fails (file:line) -->

## Codebase Patterns

<!-- - 2026-XX-XX — convention or architectural decision specific to this module (file:line) -->

## Tool & Library Notes

<!-- - 2026-XX-XX — dependency quirk, version gotcha, config surprise (file:line) -->

## Recurring Errors & Fixes

<!-- - 2026-XX-XX — error signature → root cause → fix (file:line) -->
- 2026-10-06 — A page 500s in `next dev` with `Module not found: Can't resolve './contracts/findings.js'` (import trace ends at `src/vendor/shared/index.ts`) → root cause: a VALUE import from `@devdigest/shared` (e.g. `import { SkillType } from "@devdigest/shared"` to read `SkillType.options`). The vendored barrel re-exports with `.js` specifiers that only resolve for types, so only `import type` works in the client. `tsc --noEmit` and vitest both pass with the value import — only the Next bundler fails, so it surfaces at page load, not in CI checks. Fix: `import type` only, and restate any runtime list locally typed against the contract (`src/app/skills/_components/SkillsListView/constants.ts`).
- 2026-10-06 — Correction to the entry above: the locally restated skill-type list moved with the Skills master-detail rework; it now lives at `src/app/skills/_components/SkillForm/constants.ts` (`SkillsListView/` was deleted).

## Session Notes

<!-- ### 2026-XX-XX
Short summary of what was done and what was learned. -->

## Open Questions

<!-- - Unresolved question worth flagging for a human -->
