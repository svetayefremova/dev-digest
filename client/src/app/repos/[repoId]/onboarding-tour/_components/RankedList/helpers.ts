import type { OnboardingRankedEntry } from "@devdigest/shared";
import { VISIBLE_ENTRIES } from "../OnboardingTourView/constants";

/** More than 8 entries → first 8 until expanded; 8 or fewer → never a toggle (AC-53..55). */
export function hasToggle(entries: readonly OnboardingRankedEntry[]): boolean {
  return entries.length > VISIBLE_ENTRIES;
}

export function visibleEntries(entries: readonly OnboardingRankedEntry[], expanded: boolean) {
  return expanded || !hasToggle(entries) ? entries : entries.slice(0, VISIBLE_ENTRIES);
}

/** Cap note only when the expanded list was cut by the 25-entry cap (AC-58). */
export function showTruncationNote(truncated: boolean, expanded: boolean, entries: readonly OnboardingRankedEntry[]) {
  return truncated && (expanded || !hasToggle(entries));
}
