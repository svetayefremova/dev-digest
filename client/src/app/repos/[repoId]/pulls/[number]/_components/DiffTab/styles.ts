import type { CSSProperties } from "react";

export const s = {
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  } satisfies CSSProperties,
  stats: { fontSize: 13, color: "var(--text-secondary)", flex: 1 } satisfies CSSProperties,
  add: { color: "var(--code-add-text)" } satisfies CSSProperties,
  del: { color: "var(--code-del-text)" } satisfies CSSProperties,
  noReview: { fontSize: 12.5, color: "var(--text-muted)", margin: "-8px 0 14px" } satisfies CSSProperties,
  segmented: {
    display: "inline-flex",
    padding: 3,
    gap: 2,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  segment: (active: boolean): CSSProperties => ({
    border: "none",
    borderRadius: 6,
    padding: "4px 12px",
    fontSize: 12.5,
    fontWeight: active ? 600 : 500,
    cursor: "pointer",
    background: active ? "var(--bg-hover)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
  }),
} as const;
