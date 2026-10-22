# DevDigest — repo map

Five independent packages, **no workspace** (no shared `node_modules`, no root lockfile). Run `npm install` inside each package. They're linked only by `tsconfig` path aliases, not by npm workspaces.

| Folder | Package | Role | Port |
|---|---|---|---|
| `client/` | `@devdigest/web` | Next.js studio UI | 3000 |
| `server/` | `@devdigest/api` | Fastify API + Drizzle/Postgres | — |
| `reviewer-core/` | `@devdigest/reviewer-core` | Pure review engine (no DB/GitHub/FS) | — |
| `e2e/` | `@devdigest/e2e` | Deterministic browser e2e suite | — |
| `mcp/` | `@devdigest/mcp` | Local stdio MCP server for Claude Code (talks to the API over HTTP) | — (stdio) |

Feature specs (Spec Driven Development) live in top-level `specs/<module>/SPEC-NN-<slug>.md`, written by the `spec-creator` agent before planning.

## Non-default conventions

- Not a monorepo workspace — install/build/test per package, independently.
- Shared Zod contracts live at `server/src/vendor/shared`, not as a separate top-level package.
- `reviewer-core` is pure: the only side effect allowed is an injected `LLMProvider`. It's consumed by `server` (local reviews) via tsconfig path alias, not an npm dependency.
- `mcp/` sees the server only via HTTP plus `import type` from `@devdigest/shared` — never server internals or value imports.

## Read when

- `README.md` — when you need the full repo architecture, the review-flow mermaid diagram, or the course lesson map (L01–L08).
- `.claude/skills/run-plan/SKILL.md` — when running `/run-plan <plan>` (approved plan → implement → architecture/verify fix loops → docs → self-review; spec-creator and implementation-planner are run manually before it).
- `specs/README.md` — when writing, approving or implementing a feature spec (layout, global `SPEC-NN` IDs, lifecycle, EARS).
- `TESTING.md` — when touching tests in any package (cross-package testing strategy).
- `client/CLAUDE.md`, `server/CLAUDE.md`, `reviewer-core/CLAUDE.md`, `e2e/CLAUDE.md`, `mcp/CLAUDE.md` — when working inside that package. These load automatically by location; this line is a fallback in case auto-load doesn't trigger.

## Do not

- Don't duplicate architecture details here — they live in `README.md` and get stale fast if copied.
