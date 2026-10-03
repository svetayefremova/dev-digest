# server — CLAUDE.md

`@devdigest/api` — Fastify API + Drizzle/Postgres.

## Stack

Fastify 5, Drizzle-ORM 0.38 + `postgres`, TypeScript 5.7 (ESM, run via `tsx`), Zod 3 + fastify-type-provider-zod, Anthropic SDK + OpenAI SDK, octokit, simple-git, dependency-cruiser, graphology, Vitest 2 + Testcontainers.

## Commands

```
npm run dev         # tsx watch src/server.ts
npm run build         # tsc -p tsconfig.json
npm run start           # node dist/server.js
npm run typecheck        # tsc --noEmit -p tsconfig.json
npm test                   # vitest run
npm run db:generate          # drizzle-kit generate
npm run db:migrate             # tsx src/db/migrate.ts
npm run db:seed                  # tsx src/db/seed.ts
```

## Map

- `src/adapters/` — external integrations (GitHub, LLM providers)
- `src/db/` — Drizzle schema, migrations, seed
- `src/modules/` — feature modules (e.g. `repo-intel/`, has its own README)
- `src/platform/` — cross-cutting infra
- `src/prompts/` — LLM prompt templates
- `src/vendor/shared` — shared Zod contracts (also used by `client` and `reviewer-core` via path alias — not an npm package)

## Gotchas

- `src/vendor/shared` is the single source of truth for cross-package Zod contracts — don't redefine a contract elsewhere.
- Integration tests use Testcontainers (real Postgres), not a mocked DB — see `../TESTING.md`.
- `src/modules/repo-intel/` has its own README; check it before editing that module.

## Read when

- `README.md` — when you need the API map and DI-flow diagram.
- `INSIGHTS.md` — read FIRST, before any work in this module, every session. Mandatory, not just for nontrivial tasks.
- `../TESTING.md` — when touching tests.
