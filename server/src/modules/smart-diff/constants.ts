import type { SmartDiffRole } from '@devdigest/shared';

/** Display order of the role groups. */
export const SMART_DIFF_ROLE_ORDER = [
  'core',
  'tests',
  'wiring',
  'docs',
  'boilerplate',
] as const satisfies readonly SmartDiffRole[];

/** A repo-relative path, lower-cased and split for rule predicates. */
export interface NormalizedPath {
  /** Every path segment, including the basename. */
  segments: string[];
  /** Directory segments only (basename excluded). */
  dirs: string[];
  base: string;
}

export interface ClassifyRule {
  role: SmartDiffRole;
  test: (p: NormalizedPath) => boolean;
}

const ROOT_BUILD_DIRS = new Set(['dist', 'build']);
const LOCK_FILES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock']);
const TEST_DIRS = new Set(['test', 'tests', '__tests__']);
const BARREL_FILES = new Set(['index.ts', 'index.js']);
const WIRING_ROOT_DIRS = new Set(['.github', '.claude']);

/**
 * Match order is the precedence: boilerplate, then tests, wiring, docs.
 * `core` is the fallback, not a rule. Directory patterns with no leading
 * `**` (dist, build, e2e, docs, .github, .claude) are anchored at the repo root.
 */
export const CLASSIFY_RULES: readonly ClassifyRule[] = [
  {
    role: 'boilerplate',
    test: (p) =>
      p.base.endsWith('.lock') ||
      LOCK_FILES.has(p.base) ||
      ROOT_BUILD_DIRS.has(p.segments[0] ?? '') ||
      p.dirs.includes('__snapshots__') ||
      p.base.endsWith('.snap') ||
      /\.generated\./.test(p.base) ||
      p.base.endsWith('.min.js'),
  },
  {
    role: 'tests',
    test: (p) =>
      /\.test\.tsx?$/.test(p.base) ||
      /\.spec\.ts$/.test(p.base) ||
      p.dirs.some((d) => TEST_DIRS.has(d)) ||
      p.segments[0] === 'e2e',
  },
  {
    role: 'wiring',
    test: (p) =>
      BARREL_FILES.has(p.base) ||
      /\.config\./.test(p.base) ||
      /^tsconfig.*\.json$/.test(p.base) ||
      p.base.startsWith('.eslintrc') ||
      p.base.startsWith('.env') ||
      /^docker-compose.*\.yml$/.test(p.base) ||
      WIRING_ROOT_DIRS.has(p.segments[0] ?? ''),
  },
  {
    role: 'docs',
    test: (p) =>
      p.base.endsWith('.md') ||
      p.segments[0] === 'docs' ||
      p.base.startsWith('readme') ||
      p.base.startsWith('changelog') ||
      p.base === 'license',
  },
];
