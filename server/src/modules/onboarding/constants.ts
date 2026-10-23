import type { OnboardingSectionKey } from '@devdigest/shared';
import { INDEX_JOB_WINDOW_MS } from '../repo-intel/constants.js';

/** Max entries in each ranked list (AC-13). */
export const LIST_CAP = 25;
/** Entries per list that the model writes a reason for (AC-56). */
export const REASONED_ENTRIES = 8;
export const FIRST_TASK_CAP = 3;

/** Per-excerpt char cap and number of reading-path files excerpted (AC-21). */
export const EXCERPT_CHAR_CAP = 4000;
export const EXCERPT_FILES = 4;

export const LLM_TIMEOUT_MS = 60_000;
export const COOLDOWN_MS = 60_000;
/** A `running` generation older than this is treated as orphaned and failed as `interrupted`. */
export const GENERATION_STALE_MS = INDEX_JOB_WINDOW_MS + LLM_TIMEOUT_MS + 60_000;

export const GENERATE_JOB_KIND = 'onboarding-generate';
export const PROMPT_NAME = 'onboarding.system.md';
export const SCHEMA_NAME = 'onboarding_tour';

export const SECTION_ORDER: readonly OnboardingSectionKey[] = [
  'architecture',
  'critical_paths',
  'run_locally',
  'reading_path',
  'first_tasks',
];

/** Numeric count claims ("14 routes") are never trusted from the model (AC-16). */
export const COUNT_CLAIM_RE =
  /\b\d+\s+(files?|routes?|imports?|importers?|modules?|endpoints?|callers?)\b/i;

export const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'] as const;
export const README_FILES = ['README.md', 'readme.md', 'README'] as const;
/** Files that always exist as legitimate references in model prose. */
export const ALLOWED_FILE_NAMES = ['package.json', 'README.md', '.env.example', ...COMPOSE_FILES] as const;
/** Max size of any file read from the checkout for facts/excerpts. */
export const MAX_READ_BYTES = 1_000_000;
export const MAX_COMMANDS = 12;
