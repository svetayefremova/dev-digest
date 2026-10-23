import type { OnboardingSectionKey } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Fixed section order (restated locally: the client can't value-import the shared barrel). */
export const SECTION_ORDER: readonly OnboardingSectionKey[] = [
  "architecture",
  "critical_paths",
  "run_locally",
  "reading_path",
  "first_tasks",
];

export const SECTION_ICONS: Record<OnboardingSectionKey, IconName> = {
  architecture: "Boxes",
  critical_paths: "Activity",
  run_locally: "Command",
  reading_path: "ListChecks",
  first_tasks: "Target",
};

/** Ranked-list rows shown before "Show all". */
export const VISIBLE_ENTRIES = 8;

/** Placeholder repo id the nav uses when no repo is active. */
export const NO_REPO_ID = "_";
