import type { CSSProperties } from "react";

export const s = {
  banner: (tone: "warn" | "info" | "crit"): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 13,
    color: `var(--${tone})`,
    background: `var(--${tone}-bg)`,
    border: `1px solid var(--${tone})`,
  }),
  actions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
};
