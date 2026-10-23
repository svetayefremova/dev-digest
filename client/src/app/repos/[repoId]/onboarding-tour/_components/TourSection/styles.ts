import type { CSSProperties } from "react";

export const s = {
  card: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    scrollMarginTop: 72,
  } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "12px 16px",
    background: "transparent",
    border: "none",
    color: "var(--text-primary)",
    fontSize: 14,
    fontWeight: 600,
    textAlign: "left",
    cursor: "pointer",
  } satisfies CSSProperties,
  tile: {
    width: 26,
    height: 26,
    borderRadius: 6,
    display: "grid",
    placeItems: "center",
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    flexShrink: 0,
  } satisfies CSSProperties,
  title: { flex: 1 } satisfies CSSProperties,
  chevron: { color: "var(--text-muted)", display: "grid", placeItems: "center" } satisfies CSSProperties,
  body: { padding: "0 16px 16px" } satisfies CSSProperties,
};
