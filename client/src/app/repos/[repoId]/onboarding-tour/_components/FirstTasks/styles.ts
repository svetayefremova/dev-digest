import type { CSSProperties } from "react";

export const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 } satisfies CSSProperties,
  card: {
    padding: 12,
    borderRadius: 8,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  } satisfies CSSProperties,
  title: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  path: { fontSize: 12, color: "var(--text-muted)", overflowWrap: "anywhere" } satisfies CSSProperties,
  badge: (level: "low" | "medium" | "high"): CSSProperties => {
    const tone = level === "low" ? "ok" : level === "medium" ? "warn" : "crit";
    return {
      alignSelf: "flex-start",
      padding: "1px 8px",
      borderRadius: 5,
      fontSize: 12,
      color: `var(--${tone})`,
      border: `1px solid var(--${tone})`,
      background: `var(--${tone}-bg)`,
    };
  },
  pending: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
};
