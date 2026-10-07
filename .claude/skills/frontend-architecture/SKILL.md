---
name: frontend-architecture
description: "Frontend code organization and architecture for React + Next.js App Router: where components, constants, utils/helpers, hooks, and business logic should live, and how to split a growing component or folder. Use whenever deciding where new frontend code should go, when a component/folder/file is getting too big, when reviewing a PR for logic placed in the wrong layer (a component doing data-fetching, a util secretly containing business rules, a global constants dump), or when setting up a new feature or route under app/. Complements react-best-practices (component-level correctness and anti-patterns) and next-best-practices (Next.js routing mechanics) — this skill owns organization and layering, not those two."
metadata:
  version: "0.1.0"
---

# Frontend Architecture (React + Next.js)

One core principle underlies every rule below: **colocate by default, promote only when a second real consumer shows up.** Don't pre-create `services/`, `constants/`, or `hooks/` folders in anticipation of reuse — that reuse is usually imagined, and a wrong abstraction is more expensive to undo than a late one. This is the same idea as Kent C. Dodds' "colocate until it hurts" and the promotion rule in bulletproof-react / Robin Wieruch's folder-structure guide — see `README.md` for the full source list.

This repo's `client/` (`@devdigest/web`) already follows most of this. Where an example below is marked **(this repo)**, it's describing what's actually there today, not an aspiration.

## Division of labor with sibling skills

- A component re-rendering too often, misusing `useEffect`, storing derived state → `react-best-practices`.
- Next.js file conventions (route groups, parallel/intercepting routes, middleware/proxy) → `next-best-practices`.
- This skill answers "where does this code live, and when do I split/promote it" — not "is this specific line correct."

## 1. Project & folder structure

- Default to **colocation**: new code lives next to the one thing that uses it until a second consumer needs it too.
- **(this repo)** `app/<route>/page.tsx` stays a thin route entry. The real view — and everything it owns (styles, constants, helpers, hooks, sub-components) — lives under `app/<route>/_components/<ViewName>/`. The `_` prefix is Next.js's private-folder convention: a route segment only becomes a real route once it has `page.tsx`/`route.ts`, so anything else nested inside is safe to colocate and never gets routed.
- **(this repo)** Cross-route reusable UI lives in `src/components/<feature>/`. Cross-feature logic — the API client, domain data hooks, shared types, cross-cutting helpers — lives in `src/lib/`.
- Decision rule when adding something new: *does exactly one route/component need this?* → colocate it there. *Do two or more already need it?* → promote it to `components/` (UI) or `lib/` (logic), whichever it is.
- Name folders and files after the domain concept they represent (`AgentCard/`, `DiffViewer/`, `RunTraceDrawer/`), not after their technical role (`widgets/`, `ui-elements/`). A structure that "screams" the business domain is easier to navigate than one organized by file type.

## 2. Component decomposition

- Split when a component has multiple responsibilities, when it's pushing past ~200 lines (same threshold as `react-best-practices`), or when a sub-tree could stand on its own with its own clear props contract.
- Each split-off piece gets its own folder: `ComponentName/ComponentName.tsx` + `index.ts` barrel — **(this repo)** see `components/diff-viewer/{CodeLine,FileCard,CommentCard}/` for the pattern already in use.
- The classic container/presentational split is optional now that hooks exist: default to *one component + a colocated `useXxx` hook* for its data/logic, rather than wrapping it in a separate container component whose only job is fetching data.
- Prefer composition (`children`, slots) over a component that branches internally on variant/boolean props — that's a sign it's actually two components.

## 3. Constants

- Colocate a `constants.ts` next to the component or feature that owns the values. **(this repo)** this is already the convention throughout — nearly every `_components/<ViewName>/constants.ts` and `components/<feature>/constants.ts` holds only what that view/feature needs.
- Promote a constant to a shared location (`src/lib/`) only once two or more unrelated features reference the literal same value. Don't create a global `constants/` dump preemptively — it becomes a junk drawer that nothing wants to own.
- `SCREAMING_SNAKE_CASE` for values fixed before runtime (enums of literal values, magic numbers/strings); `camelCase` for values computed once at module init.

## 4. Utils vs. helpers vs. services — and where business logic lives

Ask one question: **does this function know anything about the domain, or does it talk to an external system?**

- No domain knowledge, pure transformation (formatting, string/array manipulation) → a small colocated `helpers.ts` next to the feature that needs it. **(this repo)** `components/diff-viewer/helpers.ts`, `components/app-shell/helpers.ts`.
- Knows the domain and/or talks to an external system (API calls, auth, persistence) → that's a service/hook, never a "util," no matter how small the function looks.
- **(this repo)** the client's service layer is `src/lib/api.ts` (a thin typed fetch client) plus `src/lib/hooks/<domain>.ts` — TanStack Query hooks grouped by resource (`agents.ts`, `reviews.ts`, `trace.ts`, `repo-intel.ts`), each wrapping `api.ts`. New data-fetching logic for a domain goes into its matching `lib/hooks/<domain>.ts` file, not into a catch-all `hooks.ts` or inline in a component.
- Real business/domain logic — validation rules, workflow invariants — belongs server-side in this project (`server/`, `reviewer-core/`, per the root `README.md`'s package map). The client's own "business logic" is almost entirely query/mutation orchestration and UI state; don't re-derive domain rules client-side — call the API and let the server own correctness.
- Don't extract a helper into a shared file the moment you write it. Wait for the second real caller — an orphaned "reusable" util with one caller (and one test file) is pure overhead.

## 5. Where custom hooks should live

- Same promotion rule as constants and utils: a hook used by exactly one component lives next to it, or in that feature's own `hooks/` subfolder. **(this repo)** `components/app-shell/hooks/{useGlobalShortcuts,useShellCommands,useShellContext}.ts`.
- A hook used by two or more features is promoted to `src/lib/hooks/`, grouped by domain/resource rather than by the component that first needed it.

## 6. Next.js App Router — architecture specifics (not performance)

- `src/app` vs. a root `app/` is purely cosmetic (keeps config files out of the project root); there's no behavioral difference. **(this repo)** uses `src/app`.
- A route segment is only public once it has `page.tsx`/`route.ts` — everything else in that folder (views, styles, hooks, tests) can be colocated safely. **(this repo)** this is exactly what the `_components/` private-folder convention under `app/**` is doing.
- **(this repo)** `client/` is almost entirely a client-rendered consumer of the separate Fastify API in `server/` (see all the `'use client'` TanStack Query hooks in `lib/hooks/`) — no Server Actions, no Route Handlers for business logic. The one exception: a few dynamic routes (`app/agents/[id]/layout.tsx`, `app/repos/[repoId]/layout.tsx`, `app/repos/[repoId]/pulls/[number]/layout.tsx`) add a server-only `generateMetadata` that does a minimal `api.get(...)` fetch so the browser tab shows the agent/repo/PR name instead of a static title — the smallest possible instance of the DAL pattern below, with the page itself staying untouched. See `examples.md` §4 for the pattern (and a real bug it caught: assuming a dynamic segment's meaning from its folder name instead of checking how the client already resolves it).
- If a page does start doing server-side data access (a Server Component `fetch`, a Server Action, or a `route.ts` handler with real logic), apply the same domain-grouping + promotion rules as above, and put a server-only Data Access Layer behind them (`import 'server-only'` at the top of the module) so Server Actions and Route Handlers stay thin and delegate into it instead of each re-implementing auth/query logic. See the official Next.js Data Security guide in `README.md` for the canonical shape of this pattern.

## Quick reference

| Question | Rule |
|---|---|
| Where does a new component go? | Next to its one route/feature; promote to `components/` only once ≥2 features use it |
| Where do its constants go? | Colocated `constants.ts`; promote only on real duplication |
| Is this a util or a service? | Knows the domain / touches an API → service/hook, never a util |
| Where does a new data hook go? | `lib/hooks/<domain>.ts`, grouped by resource |
| Where does business logic live? | Server-side (`server/`, `reviewer-core/`); the client orchestrates queries/mutations, it doesn't own domain rules |
| When do I split a component? | Multiple responsibilities, ~200+ lines, or a sub-tree with its own clear props contract |

See `examples.md` for good/bad code pairs (several drawn from this repo's
own history — a real mistake, fixed) and `README.md` for the full annotated
source list these rules are drawn from.
