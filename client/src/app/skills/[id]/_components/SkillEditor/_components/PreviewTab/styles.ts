import type { CSSProperties } from "react";

/** Co-located styles for PreviewTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  lead: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 } satisfies CSSProperties,
  // The lines that precede the body in the prompt, verbatim.
  blockHeader: {
    margin: "0 0 8px",
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text-muted)",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  card: { fontSize: 14, padding: "14px 16px", overflowWrap: "anywhere" } satisfies CSSProperties,
} as const;
