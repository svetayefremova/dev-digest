/** Directory names skipped at any depth when scanning a checkout for `.md` files. */
export const EXCLUDED_DIRS: readonly string[] = ['node_modules', 'vendor', '.git'];

/** Largest document read or previewed (bytes). */
export const MAX_DOC_BYTES = 256 * 1024;

/** Most documents a scan lists (first N by path). */
export const MAX_DOCS = 500;

/** Token budget for the whole project-context block of one run. */
export const RUN_TOKEN_BUDGET = 8000;

/** Top-level folders that map to a category; anything else is `other`. */
export const CATEGORY_DIRS = ['specs', 'docs', 'insights'] as const;

/** Max entries kept in the in-process token cache. */
export const TOKEN_CACHE_MAX = 5000;

/** Max binary-search iterations when cutting a document to the remaining budget. */
export const TRUNCATE_ITERATIONS = 12;
