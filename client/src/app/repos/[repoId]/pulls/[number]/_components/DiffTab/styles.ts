import type { CSSProperties } from "react";

export const s = {
  toolbar: { display: "inline-flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  noReview: { fontSize: 12.5, color: "var(--text-muted)", margin: "-4px 0 12px" } satisfies CSSProperties,
} as const;
