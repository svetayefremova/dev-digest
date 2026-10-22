import type { CSSProperties } from "react";

export const s = {
  label: {
    marginTop: 4,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  tokens: { marginTop: 8, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  pre: {
    margin: 0,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 12,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  } satisfies CSSProperties,
};
