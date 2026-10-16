# Skills

Reusable AI skills that provide specialized knowledge and workflows. Canonical location is `.claude/skills/` with a symlink at `.cursor/skills/ → ../.claude/skills` for Cursor compatibility. Shared with the team via version control.

## Catalog

| Skill | Scope | Description |
|-------|-------|-------------|
| [fastify-best-practices](fastify-best-practices/SKILL.md) | Backend | Fastify routes, plugins, JSON-schema validation, error handling |
| [drizzle-orm-patterns](drizzle-orm-patterns/SKILL.md) | Backend | Drizzle schema, queries, relations, transactions, migrations |
| [postgresql-table-design](postgresql-table-design/SKILL.md) | Backend | Postgres schema design, data types, indexing, constraints |
| [onion-architecture](onion-architecture/SKILL.md) | Backend | Onion/Ports-and-Adapters layering: routes/service/repository dependency direction, DI container composition root |
| [next-best-practices](next-best-practices/SKILL.md) | Frontend | Next.js App Router, RSC boundaries, data fetching, optimization |
| [react-best-practices](react-best-practices/SKILL.md) | Frontend | React anti-patterns, state management, hooks rules |
| [frontend-architecture](frontend-architecture/SKILL.md) | Frontend | Folder structure, component splitting, constants/utils/services/business-logic placement |
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
| [zod](zod/SKILL.md) | Full-stack | Zod schema validation, parsing, error handling, type inference |
| [typescript-expert](typescript-expert/SKILL.md) | Full-stack | Type-level programming, performance, tooling, migrations |
| [security](security/SKILL.md) | Full-stack | OWASP Top 10:2025, auth, injection, uploads, secrets |
| [mermaid-diagram](mermaid-diagram/SKILL.md) | Shared | Mermaid diagrams in markdown (flowcharts, sequence, ERD, …) |
| [engineering-insights](engineering-insights/SKILL.md) | Shared | Captures non-obvious discoveries into the touched module's `INSIGHTS.md`; also via `/engineering-insights` |
| [pr-self-review](pr-self-review/SKILL.md) | Workflow | Maps the branch diff to relevant domain skills, normalizes severity, blocks `gh pr create`/`merge`/`push` on CRITICAL findings; also via `/pr-self-review` |

## Routing: change zone → skills

Single source of truth for which skills govern which kind of change. The `planner` agent (`.claude/agents/planner.md`) tags every plan step with skills from this table, and the `implementer` agent (`.claude/agents/implementer.md`) applies exactly those rules. Both agents preload the same full set of implementation skills (`skills:` in their frontmatter); the other agents preload the subsets listed in [Agent → preloaded skills](#agent--preloaded-skills). When adding an implementation skill, add it to this table **and** to the `skills:` list of `planner.md` and `implementer.md` (and of any other agent that should use it).

| Change zone | Skills |
|---|---|
| `client/` routes, pages, components | next-best-practices, react-best-practices, frontend-architecture |
| `client/` tests | react-testing-library |
| `server/` routes, plugins, request validation | fastify-best-practices, onion-architecture, zod |
| `server/` services, repositories, adapters, DI wiring | onion-architecture |
| `server/` DB schema, queries, migrations | drizzle-orm-patterns, postgresql-table-design |
| `reviewer-core/` | onion-architecture (purity: no DB/FS/GitHub), typescript-expert |
| Shared contracts (`server/src/vendor/shared` + `client/src/vendor/shared`) | zod, typescript-expert |
| Any module (always) | engineering-insights (read `INSIGHTS.md` first) |
| Review only (not preloaded by any agent) | security, pr-self-review |
| Docs (doc-writer) | mermaid-diagram |

### Agent → preloaded skills

Must equal the `skills:` frontmatter of each file in `.claude/agents/`.

| Agent | Preloaded skills |
|---|---|
| planner, implementer | engineering-insights, typescript-expert, zod, next-best-practices, react-best-practices, frontend-architecture, react-testing-library, fastify-best-practices, onion-architecture, drizzle-orm-patterns, postgresql-table-design (the 11 implementation skills) |
| test-writer | engineering-insights, typescript-expert, zod, react-testing-library, next-best-practices, frontend-architecture, fastify-best-practices, onion-architecture, drizzle-orm-patterns |
| architecture-reviewer | engineering-insights, onion-architecture, frontend-architecture, next-best-practices, fastify-best-practices, typescript-expert |
| plan-verifier | none (best-practice skills invite generic advice instead of criterion-by-criterion verification) |
| doc-writer | mermaid-diagram, engineering-insights, onion-architecture, frontend-architecture |
| researcher | none |

## What Are Skills?

Skills are modular packages that extend the AI agent with specialized knowledge and workflows. Unlike rules (always applied) or agents (invoked for specific tasks), skills are loaded on-demand when the agent determines they're relevant.

### Skills vs Rules vs Commands vs Agents

| Type | Scope | Loaded | Purpose |
|------|-------|--------|---------|
| **Rules** (`.mdc`) | Project conventions | Always or by file pattern | Persistent guardrails |
| **Commands** (`.md`) | User actions | On `/command` invocation | Slash commands |
| **Skills** (`.md`) | Domain knowledge | On-demand by agent | Specialized knowledge |
| **Agents** (`.md`) | Workflows | Via Task tool | Subagent orchestration |

## Creating New Skills

Each skill has:

- `SKILL.md` — Main skill file with rules and conventions (required)
- `examples.md` — Code examples showing good/bad patterns (recommended)
- `references.md` — Sources and rationale (optional)
