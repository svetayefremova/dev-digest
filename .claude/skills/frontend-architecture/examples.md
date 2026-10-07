# Frontend Architecture — examples

Format: bad code, its concrete consequence, good code, why the fix works —
in that order, with nothing between bad and good but one line, so you never
have to scroll to compare them. This mirrors how [Airbnb's JavaScript style
guide](https://github.com/airbnb/javascript) and [MDN's code style
guide](https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Code_style_guide)
pair examples — bad immediately followed by good, each marked, no prose gap.

Four of the seven pairs below are **real** — found during a project-wide
audit of this exact codebase, fixed, kept here as the "before." Three are
**illustrative** — constructed to cover rules this repo already follows
correctly today, so there's no real "before" to show; they're marked as
such. Every pair cites the source article(s) in `README.md` it's enforcing.

---

## 1. A component needs a visible route, not just a well-named folder

*Sources: [Next.js — Routing: Project Organization (Colocation)](https://nextjs.org/docs/14/app/building-your-application/routing/colocation) · [Screaming Architecture](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25)*
**Status: real, fixed** — `src/components/showcase/Showcase.tsx`

**❌ Bad** — a real component with no route pointing at it:
```tsx
// src/components/showcase/Showcase.tsx — 259 lines, exports Gallery
export function Gallery() { /* renders every @devdigest/ui component */ }
// nothing under app/ imports Gallery — only src/test/smoke.test.tsx does
```
→ Indistinguishable from dead code. A reader of `components/` has no way to
tell "real but only test-consumed" apart from "abandoned, safe to delete."

**✅ Good** — give it the route its own README already promised:
```tsx
// app/showcase/page.tsx
import { Gallery } from "../../components/showcase";
export default function ShowcasePage() {
  return <Gallery />;
}
```
→ `vendor/ui/README.md` already documented *"rendered... by the `/showcase`
route"* — the fix was building the route that contract described, not
inventing a new one.

---

## 2. One hooks file per domain, not a catch-all

*Sources: [Robin Wieruch — React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/) (promotion rule) · [bulletproof-react — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)*
**Status: real, fixed** — `lib/hooks/core.ts`

**❌ Bad** — four unrelated domains in one 137-line file:
```ts
// lib/hooks/core.ts
export function useSettings() { /* … */ }
export function useRepos() { /* … */ }
export function usePulls(repoId) { /* … */ }
export function useContextFiles(repoId) { /* … */ }
// settings + repos + pulls + project-context, all in one file
```
→ The next person adding a settings hook can't tell whether to extend
`core.ts` or start `settings.ts` — every sibling file (`agents.ts`,
`reviews.ts`, `trace.ts`) already follows one-file-per-domain, so the
inconsistency compounds with each addition.

**✅ Good** — split along the domain boundary every other file already uses:
```ts
// lib/hooks/settings.ts · repos.ts · pulls.ts · context.ts (one domain each)
export * from "./settings"; // barrel in index.ts
export * from "./repos";
export * from "./pulls";
export * from "./context";
```
→ Matches Robin Wieruch's promotion rule and bulletproof-react's
feature-grouped hooks — a reader finds a domain's hooks by its name, not by
memory of which grab-bag file happens to hold it.

---

## 3. Split a component when it outgrows one responsibility

*Sources: [patterns.dev — Presentational/Container Pattern](https://www.patterns.dev/react/presentational-container-pattern/) · [Dmitri Pavlutin — 7 Architectural Attributes of a Reliable React Component](https://dmitripavlutin.com/7-architectural-attributes-of-a-reliable-react-component/)*
**Status: illustrative** — no component in this repo is actually in this
state today (every one stays under ~200 lines with sub-components already
split out, e.g. `FindingsTab` delegates to `RunHistory`/`ReviewRunAccordion`)

**❌ Bad** — filtering, grouping, and row rendering all inlined in one component:
```tsx
function ReviewSummaryPanel({ findings }: { findings: Finding[] }) {
  const [filter, setFilter] = useState<Severity | "all">("all");
  const grouped = useMemo(() => {
    const bySeverity = new Map<Severity, Finding[]>();
    for (const f of findings) {
      if (filter !== "all" && f.severity !== filter) continue;
      /* … 30 more lines of grouping/sorting … */
    }
    return bySeverity;
  }, [findings, filter]);
  return <div>{/* 80 more lines of JSX reading `grouped` directly */}</div>;
}
```
→ A bug in the grouping logic can only be reproduced by rendering the whole
panel with real data — nothing can unit-test it in isolation, and an
unrelated JSX tweak risks silently breaking the memoized grouping.

**✅ Good** — extract the non-rendering concern into its own colocated hook:
```tsx
// useGroupedFindings.ts — pure, independently testable
function useGroupedFindings(findings: Finding[], filter: Severity | "all") { /* … */ }

// ReviewSummaryPanel.tsx — composition only
function ReviewSummaryPanel({ findings }: { findings: Finding[] }) {
  const [filter, setFilter] = useState<Severity | "all">("all");
  const grouped = useGroupedFindings(findings, filter);
  return <div>{/* renders `grouped` */}</div>;
}
```
→ The hook is unit-testable with plain data, no render required; the
component's only job is composition, matching Pavlutin's "correct
abstraction level" attribute.

---

## 4. Colocate a values file next to what uses it — don't duplicate the literal

*Source: [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation)*
**Status: real, fixed** — `app/repos/[repoId]/pulls/[number]/page.tsx`

**❌ Bad** — the same wrapper shape, inlined twice in one file:
```tsx
<div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 1080, margin: "0 auto" }}>
  {/* loading skeleton */}
</div>
// … 35 lines later …
<div style={{ padding: "24px 32px 44px", display: "flex", flexDirection: "column", gap: 24, maxWidth: 1080, margin: "0 auto" }}>
  {/* real content */}
</div>
```
→ A tweak to the shared shape (say, `maxWidth`) has to be found and changed
in two places in the same file — and nothing stops a third copy appearing
the next time someone adds another state to this page.

**✅ Good** — one named entry per shape, in a file colocated right next to the page:
```ts
// app/repos/[repoId]/pulls/[number]/styles.ts
export const s = {
  loadingWrap: { padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 1080, margin: "0 auto" },
  contentWrap: { padding: "24px 32px 44px", display: "flex", flexDirection: "column", gap: 24, maxWidth: 1080, margin: "0 auto" },
};
```
→ Per Dodds' colocation principle, the fix stayed *local* — a `styles.ts`
next to this one page, not promoted into a shared/global styles dump that
nothing else needs yet.

---

## 5. A hook with its own concern gets its own file immediately — readability, not just reuse

*Sources: [Robin Wieruch — React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/) (promotion rule) · [Dmitri Pavlutin — 7 Architectural Attributes](https://dmitripavlutin.com/7-architectural-attributes-of-a-reliable-react-component/) (single responsibility)*
**Status: illustrative** — the real pattern below already exists correctly
in `components/app-shell/hooks/`; this shows what skipping it would look like.

**❌ Bad** — command-palette logic inlined in the shell component body:
```tsx
function AppShell({ children }: { children: React.ReactNode }) {
  const commands = useMemo(() => {
    /* 40 lines building command-palette entries from routes + recent repos */
  }, [routes, recentRepos]);
  const shortcuts = useCallback((e: KeyboardEvent) => {
    /* 20 lines of keybinding logic */
  }, []);
  useEffect(() => { window.addEventListener("keydown", shortcuts); /* … */ }, [shortcuts]);
  return <div>{/* shell chrome JSX */}</div>;
}
```
→ `AppShell` mixes shell chrome with unrelated command-palette/keybinding
logic that has exactly one consumer — a change to either risks breaking the
other, and neither is unit-testable without mounting the whole shell.

**✅ Good** — extracted the moment the logic had its own identifiable concern:
```tsx
// components/app-shell/hooks/useShellCommands.ts
// components/app-shell/hooks/useGlobalShortcuts.ts
function AppShell({ children }: { children: React.ReactNode }) {
  const commands = useShellCommands();
  useGlobalShortcuts({ onOpenPalette, onOpenHelp });
  return <div>{/* shell chrome JSX only */}</div>;
}
```
→ This is the one exception to "colocate until a second consumer shows up":
splitting *complex, independently-reasoned* logic out of a component body is
about that component's readability, not about reuse — the hook still has
exactly one consumer, it just isn't buried inside unrelated JSX anymore.

---

## 6. Trust the server's computed field — don't re-derive the domain rule client-side

*Sources: [Domain-Driven Design in Frontend Applications](https://www.benedikt-sperl.de/blog/2026-03-16-domain-driven-design-in-frontend-applications) · [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) (a rule lives with its one owner)*
**Status: illustrative** — this repo already does the "good" side
(`PrMeta.status`/`score`/`cost_usd` all arrive pre-computed); shown as a
contrast so the rule is recognizable if a future screen tries to shortcut it.

**❌ Bad** — the staleness threshold re-implemented in a component:
```tsx
function isStale(pr: PrMeta) {
  const days = (Date.now() - Date.parse(pr.updated_at)) / 86_400_000;
  return pr.status === "needs_review" && days > 7; // duplicates the server's rule
}
```
→ The server's actual threshold (`deriveReviewStatus` in
`server/src/modules/pulls/status.ts`) can change — say, 7 days to 3 — and
this component silently disagrees with the API's own `status` field until
someone remembers both places exist.

**✅ Good** — the server already computed it; just render what it sent:
```tsx
<Badge>{t(`list.status.${pr.status}`)}</Badge> {/* pr.status is already "stale" when it should be */}
```
→ Per the DDD-in-frontend article, the domain rule (what counts as "stale")
has exactly one owner — the client's job is formatting, never re-deriving.

---

## 7. Next.js Server Components as a minimal data access layer (DAL)

*Sources: [Next.js — Guides: Data Security](https://nextjs.org/docs/app/guides/data-security) · [Managing Complexity: Shared Business Logic in Next.js, Part 1](https://www.iamalvisng.com/blog/managing-complexity-shared-business-logic-in-next-js-part-1-server-side-architecture)*
**Status: real** — good side shipped as written; bad side is the actual
first draft, caught in review before it shipped.

**❌ Bad** — assumed what a dynamic segment *is* from its folder name:
```tsx
// app/repos/[repoId]/pulls/[number]/layout.tsx — first draft
const { number } = await params;
const pr = await api.get<PrDetail>(`/pulls/${number}`); // wrong!
```
→ Every `/pulls/:id` route is keyed by the row's **uuid**, not the GitHub PR
**number** the `[number]` segment actually holds — this 404s into its own
`catch` on every request, silently showing the default title forever, which
is invisible without reading the response.

**✅ Good** — mirrors the resolution the client component in the same folder already does:
```tsx
const { repoId, number } = await params;
const pulls = await api.get<PrMeta[]>(`/repos/${repoId}/pulls`);
const pr = pulls.find((p) => p.number === Number(number));
return pr ? { title: `#${pr.number} ${pr.title} — DevDigest` } : {};
```
→ Per the Data Security guide's DAL pattern, the layout stays a thin
server-only fetch — the fix wasn't architectural, it was checking how
`page.tsx` already resolves the same param before assuming its meaning.
