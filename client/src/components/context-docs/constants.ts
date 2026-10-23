import type { DocCategory } from "@devdigest/shared";

/** Doc categories, in display order. Restated locally: the client can't value-import `@devdigest/shared`. */
export const DOC_CATEGORIES = ["specs", "docs", "insights", "other"] as const satisfies readonly DocCategory[];

/** Badge colours per category (CSS vars from the design system). */
export const CATEGORY_COLORS: Record<DocCategory, { color: string; bg: string }> = {
  specs: { color: "var(--accent)", bg: "var(--accent-bg)" },
  docs: { color: "var(--ok)", bg: "var(--ok-bg)" },
  insights: { color: "var(--warn)", bg: "var(--warn-bg)" },
  other: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
};
