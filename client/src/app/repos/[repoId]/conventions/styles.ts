import type { CSSProperties } from "react";

/** Co-located styles for the Conventions page. */
export const s = {
  page: { maxWidth: 1240, margin: "0 auto", padding: "28px 32px 56px" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 16 } satisfies CSSProperties,
  title: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repoName: { color: "var(--accent-text)", fontWeight: 500 } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 6 } satisfies CSSProperties,
  headerActions: { marginLeft: "auto", flexShrink: 0 } satisfies CSSProperties,
  toolbar: { display: "flex", alignItems: "center", gap: 14, margin: "22px 0 16px" } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  toolbarRight: { marginLeft: "auto" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  state: { marginTop: 28 } satisfies CSSProperties,
};
