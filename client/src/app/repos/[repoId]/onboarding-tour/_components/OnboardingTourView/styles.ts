import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 32px 48px", minHeight: "calc(100vh - 56px)" } satisfies CSSProperties,
  state: { padding: "28px 32px" } satisfies CSSProperties,
  layout: {
    display: "grid",
    gridTemplateColumns: "190px minmax(0, 1fr)",
    gap: 32,
    alignItems: "start",
    maxWidth: 1040,
  } satisfies CSSProperties,
  main: { display: "flex", flexDirection: "column", gap: 14, minWidth: 0 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  stack: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
};
