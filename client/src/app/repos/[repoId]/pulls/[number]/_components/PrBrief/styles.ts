import type { CSSProperties } from "react";

export const s = {
  empty: {
    border: "1px dashed var(--border)",
    borderRadius: 10,
    padding: 18,
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  metaValue: {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
