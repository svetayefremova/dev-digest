# Onion Architecture — Sources

## Motivation

This skill doesn't introduce Onion Architecture to the repo — it codifies a
pattern the codebase already states as intent (`server/src/vendor/shared/adapters.ts`'s
own "ALL external calls go behind these interfaces" comment, `platform/container.ts`'s
composition root, `reviewer-core/CLAUDE.md`'s "only allowed side effect is the
injected `LLMProvider`") but applies inconsistently (`agents`/`repos`/`reviews`
are layered; `polling`/`pulls`/`workspace`/`settings` aren't yet — see
`examples.md`). The sources below ground the vocabulary (Onion vs. Clean vs.
Hexagonal), the TypeScript/Node.js-specific mechanics (ports as interfaces,
repositories over Drizzle, manual DI vs. a framework), and the testing
implications of a dependency-inverted core.

## Sources

### 1. Foundational Onion Architecture

- Jeffrey Palermo — "The Onion Architecture": [part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/), [part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/), [part 4 — after four years](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/) — the original 2008 source; part 4 is Palermo revisiting it after years of real-world use.
- Herberto Graça — [Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/) — explains Onion as Ports & Adapters plus DDD-flavored internal organization of the business logic (Domain Model at the center, then Domain Services, then Application Services).
- Herberto Graça — [Ports & Adapters Architecture](https://herbertograca.com/2017/09/14/ports-adapters-architecture/) — the Cockburn-originated pattern Onion builds on: primary/driving adapters (routes) vs. secondary/driven adapters (DB, external APIs), both isolated behind ports (interfaces).
- Herberto Graça — [DDD, Hexagonal, Onion, Clean, CQRS… How I put it all together](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/) — the clearest single writeup reconciling all these pattern names into one consistent model.
- Michael Scharhag — [From layers to onions and hexagons](https://www.mscharhag.com/architecture/layer-onion-hexagonal-architecture) — a practical progression from naive N-tier layering to Onion/Hexagonal, useful for explaining *why* the dependency direction matters, not just what it is.

### 2. Comparisons (Onion vs. Clean vs. Hexagonal)

- Milan Jovanović — [Clean vs Onion vs Hexagonal Architecture](https://milanjovanovic.tech/blog/clean-architecture-vs-onion-vs-hexagonal) — all three protect business logic by making infrastructure depend on the domain; Onion arranges by layer, Clean arranges by use case. Useful for translating vocabulary when an engineer already knows one of the other names.
- Code Maze — [Onion Architecture vs Clean Architecture in .NET](https://code-maze.com/dotnet-differences-between-onion-architecture-and-clean-architecture/) — a concrete side-by-side with folder structures.

### 3. TypeScript / Node.js application

- Wolk Software — [Implementing SOLID and the onion architecture in Node.js with TypeScript and InversifyJS](http://blog.wolksoftware.com/implementing-solid-and-the-onion-architecture-in-node-js-with-typescript-and-inversifyjs) — a concrete Node/TS worked example of the ports-as-interfaces shape. Cited for the *shape*, not the DI library: this repo deliberately uses its own manual `Container` (see §5) instead of Inversify.
- [thaitype/typescript-clean-architecture](https://github.com/thaitype/typescript-clean-architecture) — a TypeScript clean-architecture template; useful as a folder-structure cross-check.
- [RanKey1496/nodejs-starter](https://github.com/RanKey1496/nodejs-starter), [Melzar/onion-architecture-boilerplate](https://github.com/Melzar/onion-architecture-boilerplate) — Node.js/Express Onion Architecture boilerplates.
- GitHub topic: [onion-architecture](https://github.com/topics/onion-architecture) — broader survey of community implementations.

### 4. Dependency inversion / ports & adapters mechanics

- [Dependency Inversion & Ports/Adapters (Synapse Studios)](https://docs.synapsestudios.com/concepts/architecture/dependency-inversion.html) — the high-level component defines the interface it needs; the low-level component implements it. Directly maps to `vendor/shared/adapters.ts` defining the interface and `server/src/adapters/*` implementing it.
- Mark Seemann (ploeh) — [Ports and fat adapters](https://blog.ploeh.dk/2025/04/01/ports-and-fat-adapters/) — a nuanced take on when an adapter is doing too much and should itself be split, relevant to `reviews/repository.ts` delegating to `pull.repo.ts`/`review.repo.ts`/`run.repo.ts`.
- [Hexagonal Architecture (Ports & Adapters) Guide + TypeScript](https://generalistprogrammer.com/tutorials/hexagonal-architecture-complete-guide) — a from-scratch TypeScript walkthrough of the pattern.

### 5. Fastify-specific mechanics that interact with the dependency rule

- Fastify official docs — [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/), [Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/), [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/) — explain *why* a `routes.ts` plugin boundary is a natural "adapter" seam: encapsulation means a module's internals don't leak to siblings, which is exactly what a layered module needs from its transport layer.
- [fastify/fastify-awilix](https://github.com/fastify/fastify-awilix) — the official Fastify DI-container plugin (Awilix-based). Cited specifically to explain *why this repo doesn't use it*: `platform/container.ts` is a simpler, framework-free composition root (lazy memoized getters, no decorators, no reflection metadata) that already does the same job.

### 6. Drizzle-specific repository pattern

- Paul Serban — [Drizzle ORM Best Practices: Principles, Patterns, and Real-World Case Studies](https://blog.paulserban.eu/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/) — repository/transaction patterns specific to Drizzle's query-builder style.
- Sentry Engineering — [Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/) — an `ITransaction` interface pattern for keeping `db.transaction` out of the application layer, directly applicable to any `repository.ts` that needs multi-step atomicity.

### 7. Testing a domain-centric architecture

- [A testing strategy for a domain-centric architecture (e.g., hexagonal)](https://medium.com/codex/a-testing-strategy-for-a-domain-centric-architecture-e-g-hexagonal-9e8d7c6d4448) — maps test types (unit/integration/contract) onto Onion/Hexagonal rings; domain logic gets pure unit tests with no mocks, infrastructure gets integration tests.
- Expedia Group Tech — [Onion Architecture. Let's slice it like a Pro](https://medium.com/expedia-group-tech/onion-architecture-deed8a554423) — reinforces the same test-pyramid-to-ring mapping with a worked example.
