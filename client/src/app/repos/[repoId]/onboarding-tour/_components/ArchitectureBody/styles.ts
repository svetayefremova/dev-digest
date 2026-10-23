import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 12, fontSize: 13.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  facts: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" } satisfies CSSProperties,
  factLabel: { fontSize: 12, color: "var(--text-muted)", marginRight: 4 } satisfies CSSProperties,
  chip: {
    padding: "1px 8px",
    borderRadius: 5,
    fontSize: 12,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
};
