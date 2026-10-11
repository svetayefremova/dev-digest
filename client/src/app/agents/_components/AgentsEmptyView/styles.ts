import type { CSSProperties } from "react";

/** Co-located styles for AgentsEmptyView. */
export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    padding: "60px 28px",
    gap: 10,
  } satisfies CSSProperties,
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--accent)",
    marginBottom: 10,
  } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  body: { fontSize: 14, color: "var(--text-secondary)", maxWidth: 360, lineHeight: 1.5 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 14 } satisfies CSSProperties,
} as const;
