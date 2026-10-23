import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  notice: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 6,
    background: "var(--code-bg)",
    fontSize: 12.5,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  index: { color: "var(--text-muted)", width: 14, flexShrink: 0 } satisfies CSSProperties,
  command: { flex: 1, minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  comment: { color: "var(--text-muted)" } satisfies CSSProperties,
  copy: {
    flexShrink: 0,
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    padding: 2,
  } satisfies CSSProperties,
  env: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  live: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
};
