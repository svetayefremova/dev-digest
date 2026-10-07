# client — CLAUDE.md

`@devdigest/web` — Next.js studio UI.

## Stack

Next.js 15.1, React 19, TypeScript 5.7, Tailwind 4, next-intl 3.26, TanStack Query 5.62, react-markdown + remark-gfm, mermaid 11.15, Vitest 2 + Testing Library.

## Commands

```
npm run dev        # next dev -p 3000
npm run build       # next build
npm run start        # next start -p 3000
npm run typecheck     # tsc --noEmit
npm test               # vitest run
```

## Map

- `src/app/` — Next.js App Router routes
- `src/components/` — UI components
- `src/i18n/`, `messages/en/` — next-intl setup and translation strings
- `src/lib/` — client-side utilities
- `src/vendor/ui/` — vendored design system (has its own README)
- `src/test/` — test setup/helpers

## Gotchas

- i18n strings live in `messages/en/`, not inline — don't hardcode UI copy.
- `src/vendor/ui/` is vendored; check its own README before editing it.
- **Styling convention: CSS variables + inline `style={{}}` objects (colocated `styles.ts` once a component has more than a couple), NOT Tailwind utility classes.** `src/vendor/ui/` is built entirely on CSS custom properties (`var(--accent)`, etc.) and every feature component follows that same pattern. Tailwind is configured but unused by convention — don't introduce Tailwind classes in new components, it would create two competing styling systems side by side.

## Read when

- `README.md` — when you need the UI route map and its mermaid diagram.
- `INSIGHTS.md` — read FIRST, before any work in this module, every session. Mandatory, not just for nontrivial tasks.
- `../TESTING.md` — when touching tests.
