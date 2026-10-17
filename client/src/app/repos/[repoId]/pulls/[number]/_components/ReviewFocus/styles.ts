import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: "18px 18px 8px",
  } satisfies CSSProperties,
  count: {
    fontSize: 12,
    fontWeight: 600,
    padding: "1px 7px",
    borderRadius: 5,
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  item: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    padding: "9px 0",
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  bullet: { color: "var(--accent)", flexShrink: 0, alignSelf: "center" } satisfies CSSProperties,
  ref: {
    fontFamily: "var(--font-mono, monospace)",
    color: "var(--accent-text)",
    textDecoration: "none",
    flexShrink: 0,
  } satisfies CSSProperties,
} as const;
