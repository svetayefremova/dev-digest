/** Finding categories in the order the legend lists them. */
export const CATEGORIES = ["bug", "security", "perf", "style", "test"] as const;
export type KnownCategory = (typeof CATEGORIES)[number];

/** Donut / legend colour per finding category. */
export const CATEGORY_COLORS: Record<KnownCategory, string> = {
  bug: "var(--crit)",
  security: "var(--warn)",
  perf: "var(--accent)",
  style: "var(--info)",
  test: "var(--ok)",
};

/** Colour for a category the client does not know yet. */
export const UNKNOWN_CATEGORY_COLOR = "var(--text-muted)";

export const DONUT_SIZE = 160;
export const RING_SIZE = 40;
