import type { CSSProperties } from "react";

/** Master-detail frame shared by /agents and /agents/:id (52px = app header). */
export const s = {
  split: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  detail: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  centered: { flex: 1, display: "grid", placeItems: "center", minWidth: 0 } satisfies CSSProperties,
  loading: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
} as const;
