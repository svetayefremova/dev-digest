import type { CSSProperties } from "react";

export const s = {
  pane: { minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto" } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    padding: "20px 32px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  path: { fontSize: 16, fontWeight: 600, wordBreak: "break-all" } satisfies CSSProperties,
  segmented: {
    display: "inline-flex",
    padding: 3,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  segment: {
    padding: "5px 14px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  usedBy: {
    marginLeft: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  body: { padding: "28px 40px 56px", maxWidth: 920 } satisfies CSSProperties,
  muted: { fontSize: 14, color: "var(--text-muted)", padding: "28px 40px" } satisfies CSSProperties,
};
