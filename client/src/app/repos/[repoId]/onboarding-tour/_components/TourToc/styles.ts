import type { CSSProperties } from "react";

export const s = {
  nav: { position: "sticky", top: 72, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  label: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  item: (active: boolean): CSSProperties => ({
    textAlign: "left",
    background: "transparent",
    border: "none",
    borderLeft: `2px solid ${active ? "var(--accent)" : "var(--border)"}`,
    padding: "6px 12px",
    fontSize: 13,
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    cursor: "pointer",
  }),
};
