import type { OnboardingTour } from '@devdigest/shared';
import type { TourIndexFacts } from '../repo-intel/types.js';

/** Facts read from the checkout (no model, no index). */
export interface RunFacts {
  scripts: Record<string, string>;
  /** dependency + devDependency names from package.json. */
  deps: string[];
  envExampleNames: string[];
  /** File name of the detected compose file, or null. */
  composeFile: string | null;
  composeText: string | null;
  readme: string | null;
  packageJsonText: string | null;
  topLevelDirs: string[];
  hasTsconfig: boolean;
}

export interface TourFacts {
  index: OnboardingTour['index'];
  intel: TourIndexFacts;
  run: RunFacts;
}

/** Model output after grounding: only verifiable content remains. */
export interface GroundedOutput {
  summary: string | null;
  diagram: string | null;
  criticalReasons: Array<{ path: string; reason: string }>;
  readingReasons: Array<{ path: string; reason: string }>;
  runCommands: string[];
  firstTasks: Array<{ title: string; path: string }>;
}

export interface Excerpt {
  label: string;
  text: string;
}
