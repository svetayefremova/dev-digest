---
name: onion-architecture
description: "Enforces Onion/Ports-and-Adapters layering for the backend packages server/ (@devdigest/api — Fastify + Drizzle/Postgres) and reviewer-core/ (@devdigest/reviewer-core — pure review engine): which layer a piece of code belongs in, the dependency rule between routes/service/repository/adapters, and how the DI container (platform/container.ts) wires concrete adapters behind port interfaces. Use when deciding where new backend logic goes, when a route handler is doing too much (touching Drizzle or an adapter directly), when adding a new modules/<name>/ feature or a new external integration/adapter, when reviewing a PR for layering violations, or when reviewer-core is being consumed from server/. Complements fastify-best-practices (route/plugin/schema mechanics) and drizzle-orm-patterns (query/schema mechanics) — this skill owns cross-layer dependency direction and composition-root wiring, not the mechanics inside a layer."
metadata:
  version: "0.1.0"
---

# Onion Architecture (backend: `server/`, `reviewer-core/`)

One rule underlies everything below: **dependencies point inward, and only
inward.** Routes depend on services, services depend on ports (interfaces),
and concrete adapters/Fastify/Drizzle sit on the outside depending on
nothing but the ports they implement. This isn't a new convention being
introduced — it's already how this repo thinks about itself:

> "Adapter interfaces. ALL external calls go behind these interfaces... Services depend on the interface, not the impl." — `server/src/vendor/shared/adapters.ts:9-13`

This skill makes that intent explicit and enforceable, cites the modules that
already do it right, and flags the ones that don't yet.

## Division of labor with sibling skills

- Mechanics of a Fastify route/plugin/schema → `fastify-best-practices`.
- Mechanics of a Drizzle query/schema/migration → `drizzle-orm-patterns`.
- Postgres table/column/index design → `postgresql-table-design`.
- This skill answers "which layer does this code belong in, and what is it
  allowed to import" — not how to write the Fastify handler or Drizzle query
  once you know where it lives.

## 1. The four rings, mapped onto this repo

| Ring | What it is | Where it lives |
|---|---|---|
| **Domain/Core** | Pure logic, zero IO | `reviewer-core/src/review/*` (the whole pure review pipeline); each module's `types.ts`/`constants.ts` |
| **Application** | Use-case orchestration | `server/src/modules/<name>/service.ts` |
| **Ports** | Interfaces the application depends on | `server/src/vendor/shared/adapters.ts` (`LLMProvider`, `GitHubClient`, `GitClient`, `SecretsProvider`, `AuthProvider`, `CodeIndex`, `Embedder`) + module-local interfaces (`DepGraph`, `Tokenizer`) |
| **Infrastructure/Adapters** | Concrete implementations, frameworks | `server/src/adapters/*`, `server/src/db/*`, `server/src/modules/<name>/routes.ts` (Fastify), `server/src/platform/container.ts` (composition root) |

The direction is always Infrastructure → Application → Domain. A domain or
application file never imports from an adapter, Fastify, or the raw Drizzle
client.

`reviewer-core` is the strictest instance of the innermost ring — its own
`CLAUDE.md` states: *"No DB, GitHub, or filesystem access here — the only
allowed side effect is the injected `LLMProvider`."* Any new "pure engine"
submodule should be held to that same bar.

## 2. The Dependency Rule, as concrete bans

- `service.ts` / `repository.ts` / `types.ts` never import `fastify`,
  `FastifyRequest`, or `FastifyReply`.
  - **The one sanctioned exception:** `server/src/modules/_shared/context.ts`.
    `getContext(container, req)` is the single place `FastifyRequest` is
    touched outside a `routes.ts` — it resolves `{ workspaceId, userId }` at
    the edge and hands a plain object inward. That's the model for bridging
    any framework type into the domain: translate once, at the boundary,
    into plain data.
- `service.ts` never imports a concrete class from `adapters/*`. It only
  depends on types from `@devdigest/shared` or the `Container` type
  (`platform/container.ts`) — never `new OctokitGitHubClient(...)` or similar
  outside the container.
- Domain/application code never imports `drizzle-orm` outside
  `repository.ts` — `repository.ts` is the only Drizzle-aware file in a
  module.
  - **Allowed exception:** a pure type extraction like
    `typeof t.repos.$inferSelect` from `db/schema.js` is fine anywhere — it's
    reusing a *type*, not running a query. `repos/helpers.ts` and
    `reviews/run-executor.ts`/`diff-loader.ts` do exactly this.
- `routes.ts` stays thin: zod validation, one call into the service, HTTP
  status/shape mapping. No business rules, no direct `db`/adapter calls.
  `modules/repos/routes.ts:9-10` states this as its own doc comment:
  *"Transport layer only: parses requests, maps status codes, and delegates
  all business logic to RepoService."*

## 3. Composition root rules (`platform/container.ts`)

There is **no DI framework** in this repo (no `di.ts`/`inject.ts`, no
decorators, no `awilix`/`tsyringe`/`inversify`) — `Container` is a hand-rolled
composition root: concrete adapters are constructed behind lazy, memoized
getters (`??=`), and `ContainerOverrides` is the seam tests use to inject
fakes. **Keep it that way** — don't propose adding a DI library; it would
duplicate what `Container` already does.

- New external integration → add the interface to
  `server/src/vendor/shared/adapters.ts` → add the implementation under
  `server/src/adapters/<name>/` → add a lazy getter on `Container` (follow
  the `git`/`codeIndex`/`repoIntel` getter pattern). Nothing outside
  `container.ts` should `new` a concrete adapter class.
- Cross-module shared repositories are constructed **once, in the
  container** (`container.agentsRepo`, `container.reviewRepo`) specifically
  so one module's service never imports another module's `repository.ts`
  directly — it reaches `container.<otherModule>Repo` instead.
- `server/src/app.ts` builds **one `Container` per app** and decorates it
  onto the Fastify instance (`app.decorate('container', container)`); every
  route reaches it via `app.container`/`req.server.container`. This is a
  process-wide singleton, not per-request DI — don't design new code
  assuming request-scoped container state.

## 4. `reviewer-core` as the gold-standard pure core

`server/src/modules/reviews/run-executor.ts:187-213` is the real consumption
boundary and the template to copy for any similar integration:

> "The pure review pipeline lives in @devdigest/reviewer-core (shared with the CI runner). The service owns only I/O: repo-intel context resolution above, and persistence + observability below."

`reviewPullRequest`/`countBlockers` are called from the **service**
(`ReviewRunExecutor`, used by `ReviewService`) — never from `routes.ts`. The
executor resolves every side effect (diff loading, repo-intel enrichment,
the injected `llm` adapter, the run-log/SSE sink) *around* the pure call; the
engine itself touches nothing external.

## 5. Anti-patterns to flag in review

- **Fat route handlers with inline Drizzle + business rules.** Known
  examples not yet refactored: `modules/polling/routes.ts` (poll-and-upsert
  flow across three tables, fused into one handler, no `service.ts`/
  `repository.ts`), `modules/pulls/routes.ts` (~340 lines: GitHub sync loops,
  a `BACKFILL_LIMIT` business rule, and score/cost rollups, all inline),
  `modules/workspace/routes.ts` (same shape, smaller). Don't add to these —
  and treat any PR that grows them further as a signal to extract a
  `service.ts`/`repository.ts` pair instead.
- **A "service-shaped" function that still bypasses a repository.**
  `modules/settings/feature-models.ts` takes a `Container` (looks layered)
  but queries `container.db` directly instead of going through a
  `SettingsRepository` — looking layered isn't the same as being layered;
  check what it actually imports, not just its parameter list.
- **Cross-module repository reach-around** — importing another module's
  `repository.ts` instead of using the shared getter the container already
  exposes for it.
- **Introducing a DI framework** (awilix, tsyringe, inversify) — the manual
  `Container` is the chosen mechanism; don't suggest replacing it.
- **Note the sanctioned exception, don't over-flag it:** `platform/jobs.ts`
  queries Drizzle (`t.jobs`) directly. That's fine — it's platform-owned
  cross-cutting infra (the job queue), not a feature module reaching into a
  domain table it doesn't own. The rule is "a *feature module* must go
  through its own repository," not "nothing outside `repository.ts` may ever
  touch Drizzle."

## 6. Testing implications

- Domain/application tests inject fakes via `ContainerOverrides`, not
  `vi.mock` of concrete adapter modules — services depend on interfaces, so
  tests should swap the interface, not reach around it.
- Repository tests hit a real Postgres via Testcontainers (see root
  `TESTING.md`) — the repository is the integration boundary, test it as
  one.
- `reviewer-core` tests inject a fake `LLMProvider` — its only side-effect
  seam.

## 7. Checklists

**New `modules/<name>/` feature:**
1. `types.ts` / `constants.ts` — domain shapes and literals, zero IO.
2. `repository.ts` — the module's only Drizzle-aware file.
3. `service.ts` — constructor takes `Container` (or a narrower slice of it)
   only; orchestrates the repository and any ports it needs.
4. `routes.ts` — Fastify + zod, thin: validate, call one service method,
   shape the response.
5. Register the plugin in `server/src/modules/index.ts`.

**New external integration:**
1. Interface → `server/src/vendor/shared/adapters.ts`.
2. Implementation → `server/src/adapters/<name>/`.
3. Lazy getter → `server/src/platform/container.ts`.
4. Mock/fake for tests → alongside the real implementation, wired through
   `ContainerOverrides`.

## Quick reference

| Question | Rule |
|---|---|
| Can `service.ts` import `fastify`? | No — only `_shared/context.ts`'s `getContext` touches `FastifyRequest`, and only to translate at the edge |
| Can `service.ts` `new` a concrete adapter? | No — read it off `Container`; only `container.ts` constructs adapters |
| Can anything outside `repository.ts` import `drizzle-orm`? | No, except pure `typeof table.$inferSelect` type extraction |
| How thin should `routes.ts` be? | Validate → one service call → shape HTTP response. Nothing else |
| Where does a new adapter's interface go? | `vendor/shared/adapters.ts`, implementation in `adapters/<name>/`, wired via a `Container` getter |
| Should we add awilix/tsyringe/inversify? | No — `Container` already is this repo's DI mechanism |
| Where does `reviewer-core` get called from? | The service layer only (see `reviews/run-executor.ts:187-213`), never `routes.ts` |
| Is a module reaching another module's repo OK? | No — go through the container's shared getter (`agentsRepo`, `reviewRepo`) |

See `examples.md` for good/bad code pairs and `README.md` for the full
annotated source list these rules are drawn from.
