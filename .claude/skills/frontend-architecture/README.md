# Frontend Architecture — Sources

## Motivation

`react-best-practices` covers component purity, hooks misuse, and performance; its "Code Organization" section is one line. `next-best-practices` covers Next.js routing *mechanics* (special files, route segments, parallel/intercepting routes) but not where business logic, services, or constants should live relative to them. This skill fills that gap: project/folder structure, component decomposition, constants placement, utils/helpers/services separation, hooks placement, business-logic placement, and the Next.js App Router-specific version of all of the above. The rules in `SKILL.md` are drawn from the sources below.

## Sources

### 1. Overall project structure & where components live

- [bulletproof-react — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — The most-cited React architecture reference. Feature-based structure with a `features/` folder as the organizational hub; shared `hooks/`, `utils/`, `components/`, `types/` at the top level, feature-scoped versions inside each feature; enforces a unidirectional flow (shared → features → app) so features never import from each other.
- [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview) — A full methodology, not just a convention: seven layers (`app → pages → widgets → features → entities → shared`) with a strict import rule (a layer may only import from layers strictly below it), and within each slice, segments (`ui`, `api`, `model`, `lib`, `config`) separate UI from business logic from config.
- [feature-sliced/documentation (GitHub)](https://github.com/feature-sliced/documentation) — The canonical spec/reference implementation behind feature-sliced.design; useful for exact terminology and edge cases (e.g. the deprecated `processes` layer).
- [Robin Wieruch — React Folder Structure Best Practices (2026)](https://www.robinwieruch.de/react-folder-structure/) — A progressive structure (single file → component folders → technical folders → feature folders → domain grouping → monorepo) with an explicit **promotion rule**: code starts colocated and only moves to a shared folder once two or more features need it.
- [Screaming Architecture — Evolution of a React Folder Structure (dev.to/profydev)](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25) — Applies Uncle Bob's "Screaming Architecture" to React: folder names should announce the business domain (`todos/`, `invoices/`) rather than the technical role (`components/`, `hooks/`), so the structure is self-documenting.

### 2. How components should be split / composed

- [patterns.dev — Presentational/Container Pattern](https://www.patterns.dev/react/presentational-container-pattern/) — The classic split (container = data/logic, presentational = props-in/UI-out) plus the modern correction: hooks absorbed most of what containers did, so the hard container/presentational split is now a default-to-hooks, split-when-needed guideline rather than a mandatory wrapper pattern.
- [Dmitri Pavlutin — 7 Architectural Attributes of a Reliable React Component](https://dmitripavlutin.com/7-architectural-attributes-of-a-reliable-react-component/) — Concrete, checkable attributes (single responsibility, correct abstraction level, absence of side effects in render, etc.) useful as a "should I split this component" checklist rather than a vague SRP slogan.

### 3. Where constants should live

- [How to Add a Constants File to Your React Project (Medium)](https://medium.com/@austinpaley32/how-to-add-a-constants-file-to-your-react-project-6ce31c015774) — Baseline convention: a dedicated `constants/` (or `constants/index.ts`) to avoid magic numbers/strings scattered across components; `SCREAMING_SNAKE_CASE` for values fixed before runtime, `camelCase` for values computed at init.
- [Best Practices for Creating and Using Constant Files in React (DevGex)](https://devgex.com/en/article/00046806) — Reinforces centralization as a single-source-of-truth argument; pairs well with the bulletproof-react/FSD rule that feature-specific constants live inside the feature/slice, only cross-feature constants graduate to a shared location.

### 4. Utils vs. helpers vs. services — separating business logic

- [Lib vs Utils vs Services Folders: Simple Explanation for Developers (indie-starter.dev)](https://indie-starter.dev/blog/lib-vs-utils-vs-services-folders-simple-explanation-for-developers) — The cleanest three-way distinction found: `lib/` = polished, near-package-quality reusable code; `utils/` = small generic helpers with no business meaning (date formatting, string manipulation); `services/` = business logic and external integrations (API calls, auth, DB). This is the rule to encode: if a function *knows about the domain*, it isn't a util.
- [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) — The counter-weight to over-eager extraction: "colocate until it hurts, then abstract." Warns specifically against prematurely moving helper functions into a shared `utils/` the moment they're written — orphaned utils (and their tests) outlive the component that needed them. Keep a helper next to its one caller until a second caller actually appears.
- [Domain-Driven Design in Frontend Applications (benedikt-sperl.de)](https://www.benedikt-sperl.de/blog/2026-03-16-domain-driven-design-in-frontend-applications) — The strongest version of "business logic belongs in its own layer": domain logic (entities, invariants) should not depend on the UI framework at all; the UI is deliberately "the dumbest part of the application." Useful as the north star even if full DDD layering is overkill for most features.

### 5. Where custom hooks should live

- Robin Wieruch's folder-structure guide (above, §1) gives the operative rule directly: a hook used by exactly one component stays in that component's file or a sibling `hooks.ts`; a hook used by ≥2 features is promoted to a shared `hooks/` folder. Same promotion logic as utils — don't pre-create a shared hooks folder before it's earned.
- bulletproof-react's structure (above, §1) mirrors this at the feature level: each `features/<name>/hooks/` holds feature-scoped hooks; only cross-feature hooks live in the top-level `hooks/`.

### 6. Where business logic should live overall

- Domain-Driven Design in Frontend Applications (above, §4) — business/domain logic as a framework-independent layer, testable without React at all.
- [Managing Complexity: Shared Business Logic in Next.js, Part 1 — Server-Side Architecture (iamalvisng.com)](https://www.iamalvisng.com/blog/managing-complexity-shared-business-logic-in-next-js-part-1-server-side-architecture) — A concrete three-layer split for a Next.js backend: `repositories/` (DB/external API access), `actions/` (the actual business logic, callable from both Server Components and client code via `'use server'`), `api/` routes as thin wrappers that call the same action functions — so logic is written once regardless of entry point.
- Kent C. Dodds — Colocation (above, §4) — applies equally to where business logic starts: next to the one place that needs it, promoted to a shared layer only once reuse is real, not anticipated.

### 7. Next.js App Router architecture specifically

- [Next.js — Getting Started: Project Structure](https://nextjs.org/docs/app/getting-started/project-structure) — Official baseline: top-level folder/file conventions, what `src/` does and doesn't change.
- [Next.js — File-system Conventions: `src` folder](https://nextjs.org/docs/app/api-reference/file-conventions/src-folder) — `src/app` vs root `app/` is purely cosmetic (keeps config files out of the root); no behavioral difference either way.
- [Next.js — Routing: Project Organization (Colocation)](https://nextjs.org/docs/14/app/building-your-application/routing/colocation) — The official position: a route segment is only public once it has a `page.tsx`/`route.ts`, so arbitrary files (components, styles, tests, and — relevant here — feature logic) can be safely colocated inside `app/` next to the routes that use them; private folders (`_lib`, `_components`) opt a folder out of routing entirely.
- [Next.js — Guides: Data Security](https://nextjs.org/docs/app/guides/data-security) — The single most load-bearing source for "where does business/auth logic live in App Router": recommends a server-only **Data Access Layer** (`data/*.ts`, `import 'server-only'`) that performs auth checks and returns minimal DTOs; Server Actions and Route Handlers stay thin and delegate into the DAL instead of duplicating auth/query logic in each one. Directly answers "where do services/business logic live relative to Server Components, Server Actions, and Route Handlers."
- [Managing Complexity: Shared Business Logic in Next.js, Part 1 (iamalvisng.com)](https://www.iamalvisng.com/blog/managing-complexity-shared-business-logic-in-next-js-part-1-server-side-architecture) — (cross-referenced from §6) A worked example of the DAL idea above, with an explicit repository/action/route-handler layering and the rationale for why action functions — not route handlers — should hold the logic.
