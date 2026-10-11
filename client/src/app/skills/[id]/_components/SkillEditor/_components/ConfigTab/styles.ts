import type { CSSProperties } from "react";

/** Co-located styles for the skill ConfigTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 4 } satisfies CSSProperties,
  message: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  messageHint: { fontSize: 12, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.45 } satisfies CSSProperties,
  danger: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginTop: 32,
    paddingTop: 20,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  dangerText: { flex: 1, fontSize: 13, lineHeight: 1.45, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
