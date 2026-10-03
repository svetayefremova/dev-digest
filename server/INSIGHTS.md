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

## Tool & Library Notes

<!-- - 2026-XX-XX — dependency quirk, version gotcha, config surprise (file:line) -->

## Recurring Errors & Fixes

<!-- - 2026-XX-XX — error signature → root cause → fix (file:line) -->
- 2026-10-02 — `pnpm db:migrate` fails with `column "X" of relation "Y" already exists` right after generating a brand-new migration via `pnpm db:generate`, even though `drizzle-kit` reported it as a fresh file. Root cause: the local dev Postgres container is shared across course checkouts/branches on this machine, so `drizzle.__drizzle_migrations` can hold more applied-hash rows than there are `.sql` files in this checkout's `server/src/db/migrations/` — the live table is already ahead of the schema this branch declares. Diagnostic: `select count(*) from drizzle.__drizzle_migrations` vs the number of entries in `migrations/meta/_journal.json` — a mismatch is the tell. Fix (safe only when the live column already matches what the new migration would produce): hash the migration file with drizzle's own algo (`sha256` over the raw file bytes — see `node_modules/drizzle-orm/migrator.js`) and `INSERT` that hash into `drizzle.__drizzle_migrations` directly to mark it applied, e.g. `node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('path/to/file.sql')).digest('hex'))"`.

## Session Notes

<!-- ### 2026-XX-XX
Short summary of what was done and what was learned. -->

## Open Questions

<!-- - Unresolved question worth flagging for a human -->
