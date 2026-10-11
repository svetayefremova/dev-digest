/** Version assigned to a freshly created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Largest upload (raw bytes, before base64) the import preview accepts. */
export const MAX_IMPORT_BYTES = 500 * 1024;

/** Largest skill markdown we will read out of an upload (zip-bomb guard). */
export const MAX_SKILL_MD_BYTES = 200 * 1024;

/** The file an archive must carry its skill in (matched case-insensitively). */
export const SKILL_MD_FILENAME = 'skill.md';

/** Type given to an imported skill when its frontmatter doesn't name a valid one. */
export const DEFAULT_IMPORT_TYPE = 'custom';

/** Longest version message ("What changed") a caller may supply. */
export const MAX_VERSION_MESSAGE_LENGTH = 500;

/** Finding categories, in the fixed order `SkillStats.by_category` reports them. */
export const FINDING_CATEGORIES = ['bug', 'security', 'perf', 'style', 'test'] as const;

/** Version messages the server writes when the caller supplies none. */
export const VERSION_MESSAGES = {
  initial: 'Initial version',
  imported: (file?: string) => (file ? `Imported from ${file}` : 'Imported from file'),
  updated: 'Updated body',
  restored: (version: number) => `Restored v${version}`,
} as const;
