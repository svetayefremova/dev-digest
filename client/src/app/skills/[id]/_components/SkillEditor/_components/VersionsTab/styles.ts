import type { CSSProperties } from "react";
import type { DiffKind } from "./helpers";

const DIFF_BG: Record<DiffKind, string> = {
  same: "transparent",
  add: "var(--code-add)",
  del: "var(--code-del)",
};

const DIFF_COLOR: Record<DiffKind, string> = {
  same: "var(--text-secondary)",
  add: "var(--code-add-text)",
  del: "var(--code-del-text)",
};

/** Co-located styles for VersionsTab and its diff modal. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: (current: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "11px 14px",
    borderRadius: 8,
    border: "1px solid " + (current ? "var(--accent)" : "var(--border)"),
    background: current ? "var(--bg-hover)" : "var(--bg-elevated)",
  }),
  version: { fontSize: 14, fontWeight: 700, minWidth: 36 } satisfies CSSProperties,
  message: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  noMessage: { color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,

  diffStat: { display: "flex", gap: 12, padding: "12px 24px 0", fontSize: 12 } satisfies CSSProperties,
  addText: { color: "var(--code-add-text)" } satisfies CSSProperties,
  delText: { color: "var(--code-del-text)" } satisfies CSSProperties,
  diffBody: {
    margin: "12px 24px 20px",
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--bg-surface)",
    overflow: "auto",
    padding: "8px 0",
  } satisfies CSSProperties,
  diffLine: (kind: DiffKind): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: "44px 44px 20px 1fr",
    fontSize: 12.5,
    lineHeight: 1.6,
    background: DIFF_BG[kind],
  }),
  lineNo: {
    textAlign: "right",
    paddingRight: 10,
    color: "var(--text-muted)",
    userSelect: "none",
  } satisfies CSSProperties,
  marker: (kind: DiffKind): CSSProperties => ({
    textAlign: "center",
    color: DIFF_COLOR[kind],
    userSelect: "none",
  }),
  lineText: (kind: DiffKind): CSSProperties => ({
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    paddingRight: 12,
    color: kind === "same" ? "var(--text-secondary)" : "var(--text-primary)",
  }),
  identical: { padding: "28px 24px", fontSize: 14, color: "var(--text-muted)", textAlign: "center" } satisfies CSSProperties,
} as const;
