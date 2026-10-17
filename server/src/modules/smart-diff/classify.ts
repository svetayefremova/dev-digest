import type { SmartDiffRole } from '@devdigest/shared';
import { CLASSIFY_RULES, type NormalizedPath } from './constants.js';

export function normalizePath(path: string): NormalizedPath {
  const segments = path
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .toLowerCase()
    .split('/')
    .filter((s) => s.length > 0);
  const base = segments[segments.length - 1] ?? '';
  return { segments, dirs: segments.slice(0, -1), base };
}

/** Pure, HTTP-free role of a changed file. First matching rule wins, else `core`. */
export function classifyFile(path: string): SmartDiffRole {
  const p = normalizePath(path);
  for (const rule of CLASSIFY_RULES) {
    if (rule.test(p)) return rule.role;
  }
  return 'core';
}
