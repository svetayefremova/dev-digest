# server — INSIGHTS

Append-only log of engineering insights captured in `server/`. Written by the `engineering-insights` skill (proactively, or via `/engineering-insights` at the end of a session/task). Read this before nontrivial work in this module — treat it as high-confidence guidance unless something here is clearly outdated.

**Rules:** never overwrite an entry — append a new dated correction instead. Each entry: date + concrete fact + `file:line` where applicable. Skip anything obvious from reading the code.

## What Works

<!-- - 2026-XX-XX — approach that worked, and why (file:line) -->

## What Doesn't Work

<!-- - 2026-XX-XX — dead end / antipattern, and why it fails (file:line) -->

## Codebase Patterns

<!-- - 2026-XX-XX — convention or architectural decision specific to this module (file:line) -->
- 2026-10-02 — `server/CLAUDE.md` calls `server/src/vendor/shared` "the single source of truth," but `client/src/vendor/shared` is a literal duplicated copy (byte-identical apart from comments), not a symlink — there's no sync script anywhere in the repo (checked `scripts/`, all `package.json`s, grepped for "sync*shared"). Every contract edit must be hand-applied to both `server/src/vendor/shared/contracts/*.ts` and `client/src/vendor/shared/contracts/*.ts`, or the packages silently drift (each only typechecks against its own copy, so TS won't catch the mismatch).

- 2026-10-10 — `container.git.readFile(ref, path)` resolves against THIS checkout's `DEVDIGEST_CLONE_DIR` (`clonePathFor`), not the repo row's `clone_path`. Because the dev Postgres is shared across checkouts, `repos.clone_path` can point into another checkout's `clones/` while this one has none: the repo reads as "cloned", yet every `git.readFile` fails. Seen as `POST /repos/:id/conventions/extract` → 422 "No files to analyse" (Run Scan did nothing but toast). Diagnostic: `select clone_path from repos` vs `ls server/clones`. Fix used: read sampled files from the row's `clonePath` with `node:fs`, as repo-intel does (`src/modules/conventions/service.ts` `readSamples`). Anything still going through `container.git` (diffs for reviews) has the same exposure.

- 2026-10-16 — `agent_runs` has no agent-name column: run history gets `agent_name` from a LEFT JOIN on `agents` (`modules/reviews/repository/run.repo.ts` `listRunsForPull`/`activeRunsForPull`), so agent-less runs (the PR intent classifier, `agent_id` NULL) need `agent_runs.label` (migration `0018`) to show a name. Every `agent_runs` row for a PR now includes the classifier row, so anything counting a PR's runs (e.g. `waitForPrRuns(..., { expected: 1 })` in `test/reviews.it.test.ts`) can see the classifier's row finish before the review does.

- 2026-10-16 — Prompt observability without breaking reviewer-core purity: the core returns content-free `sections` metadata from `assemblePrompt` and hands it to the injected `ReviewInput.onPromptAssembled` callback; the server logs it via `platform/prompt-log.ts`, which builds the log object from an explicit allowlist (never spreads input). Section texts cross the boundary only when `promptDebug` is set (local verbose mode), and are used only for hashing/token counts. Keep new prompt sections registered via `push()` in `reviewer-core/src/prompt.ts` so they show up in the metadata.

## Tool & Library Notes

<!-- - 2026-XX-XX — dependency quirk, version gotcha, config surprise (file:line) -->
- 2026-10-06 — `new MockAuthProvider(undefined, workspace)` keeps the default user id `'u1'`, which is not a uuid: `POST /agents` then fails on `agents.created_by` and `res.json().id` is `undefined`. A later request to `/agents/undefined/...` returns 422 from param validation, so a "cross-workspace is rejected with 422" assertion passes for the wrong reason. Pass a real seeded `users` row as the mock user and assert the 201 (`test/skills.it.test.ts` `appAs` / `createAgent`).

## Recurring Errors & Fixes

<!-- - 2026-XX-XX — error signature → root cause → fix (file:line) -->
- 2026-10-02 — `pnpm db:migrate` fails with `column "X" of relation "Y" already exists` right after generating a brand-new migration via `pnpm db:generate`, even though `drizzle-kit` reported it as a fresh file. Root cause: the local dev Postgres container is shared across course checkouts/branches on this machine, so `drizzle.__drizzle_migrations` can hold more applied-hash rows than there are `.sql` files in this checkout's `server/src/db/migrations/` — the live table is already ahead of the schema this branch declares. Diagnostic: `select count(*) from drizzle.__drizzle_migrations` vs the number of entries in `migrations/meta/_journal.json` — a mismatch is the tell. Fix (safe only when the live column already matches what the new migration would produce): hash the migration file with drizzle's own algo (`sha256` over the raw file bytes — see `node_modules/drizzle-orm/migrator.js`) and `INSERT` that hash into `drizzle.__drizzle_migrations` directly to mark it applied, e.g. `node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('path/to/file.sql')).digest('hex'))"`.
- 2026-10-06 — Adding a value to a Drizzle `text(..., { enum })` column passes typecheck and every Testcontainers test, then fails on the local dev DB with `new row for relation "skills" violates check constraint "skills_source_ck"`. Root cause: the shared local Postgres (see the entry above) carries CHECK constraints (`skills_source_ck`, `skills_type_ck`) created by another checkout; this checkout's migrations never declared them, so a fresh test DB has none. Diagnostic: `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='skills'::regclass and contype='c'`. Fix used: declare the constraint in the schema with `check()` and hand-prepend `DROP CONSTRAINT IF EXISTS` to the generated migration so it applies on both fresh and already-constrained DBs (`src/db/schema/skills.ts`, `src/db/migrations/0014_modern_baron_zemo.sql`). Check for a `_ck` constraint before widening any other enum column.
- 2026-10-06 — Same shared-dev-DB drift, column flavour: `db:generate` emitted `ADD COLUMN "message"` for `skill_versions`, but the local Postgres already had a nullable, default-less `message` column from another checkout (check with `\d <table>` BEFORE `db:migrate`). Fix used: hand-edit the generated SQL to `ADD COLUMN IF NOT EXISTS` + backfill NULLs + `SET DEFAULT` + `SET NOT NULL`, so it converges on both a fresh DB and the drifted one (`src/db/migrations/0015_flowery_firestar.sql`).

- 2026-10-10 — `npm run db:generate` hangs with no output when a change both drops a column and adds one on the same table (drizzle-kit asks interactively "created or renamed?", and a piped/non-TTY run just waits). Hit when replacing `conventions.accepted` with `status`. Fix: generate in two steps — add the new columns first (`0016`), then remove the old one (`0017`) — with `npx drizzle-kit generate < /dev/null`.

## Session Notes

<!-- ### 2026-XX-XX
Short summary of what was done and what was learned. -->

## Open Questions

<!-- - Unresolved question worth flagging for a human -->
