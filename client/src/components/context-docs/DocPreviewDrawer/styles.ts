import type { CSSProperties } from "react";

export const s = {
  meta: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  toggleRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 14 } satisfies CSSProperties,
  unreadable: { fontSize: 14, color: "var(--text-muted)" } satisfies CSSProperties,
};
