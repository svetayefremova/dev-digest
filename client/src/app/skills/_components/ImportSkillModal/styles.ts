import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillModal. */
export const s = {
  body: { padding: 24 } satisfies CSSProperties,
  picker: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 16,
    border: "1px dashed var(--border-strong)",
    borderRadius: 8,
    marginBottom: 20,
  } satisfies CSSProperties,
  pickerText: { fontSize: 13, color: "var(--text-muted)", minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", marginBottom: 16 } satisfies CSSProperties,
  heading: { fontSize: 14, fontWeight: 700, marginBottom: 4 } satisfies CSSProperties,
  source: { fontSize: 12, color: "var(--text-muted)", marginBottom: 16 } satisfies CSSProperties,
  callout: (tone: "warn" | "muted"): CSSProperties => ({
    fontSize: 13,
    lineHeight: 1.45,
    color: "var(--text-secondary)",
    background: tone === "warn" ? "var(--warn-bg)" : "var(--bg-elevated)",
    border: "1px solid " + (tone === "warn" ? "var(--warn)" : "var(--border)"),
    borderRadius: 7,
    padding: "12px 14px",
    marginBottom: 16,
  }),
  calloutTitle: { fontWeight: 650, color: "var(--text-primary)", marginBottom: 4 } satisfies CSSProperties,
  skippedList: { margin: "8px 0 0", paddingLeft: 18, fontSize: 12, overflowWrap: "anywhere" } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
