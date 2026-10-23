import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 } satisfies CSSProperties,
  title: { margin: 0, fontSize: 22, fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  repo: { color: "var(--accent-text)" } satisfies CSSProperties,
  subline: { margin: "6px 0 0", fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  notice: { margin: "6px 0 0", fontSize: 12.5, color: "var(--warn)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 } satisfies CSSProperties,
  elapsed: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  regen: (disabled: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 11px",
    fontSize: 12.5,
    fontWeight: 500,
    borderRadius: 6,
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-strong)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  }),
  live: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
};
