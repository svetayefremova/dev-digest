import type { SkillStats } from "@devdigest/shared";
import { CATEGORIES, CATEGORY_COLORS, UNKNOWN_CATEGORY_COLOR, type KnownCategory } from "./constants";

export interface CategoryRow {
  category: string;
  count: number;
  color: string;
  /** False for a category outside the known five (shown under its raw name). */
  known: boolean;
}

/**
 * True when the 30-day window holds anything to show. With no completed runs
 * the percentages are null and there are no findings — an empty state, not zeros.
 */
export function hasRunData(stats: SkillStats): boolean {
  return stats.pull_pct !== null || stats.accept_pct !== null || stats.findings_30d > 0;
}

const isKnown = (category: string): category is KnownCategory =>
  (CATEGORIES as readonly string[]).includes(category);

/**
 * Legend rows: the five known categories in a fixed order (zero when absent),
 * then any category the client does not know, in the order the API sent it.
 */
export function categoryRows(byCategory: SkillStats["by_category"]): CategoryRow[] {
  const counts = new Map<string, number>();
  for (const { category, count } of byCategory) counts.set(category, (counts.get(category) ?? 0) + count);

  const rows: CategoryRow[] = CATEGORIES.map((category) => ({
    category,
    count: counts.get(category) ?? 0,
    color: CATEGORY_COLORS[category],
    known: true,
  }));
  for (const [category, count] of counts) {
    if (!isKnown(category)) rows.push({ category, count, color: UNKNOWN_CATEGORY_COLOR, known: false });
  }
  return rows;
}
